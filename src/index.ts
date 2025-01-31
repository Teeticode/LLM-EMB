interface Env {
  VECTORIZE: Vectorize;
  AI: Ai;
}

interface EmbeddingResponse {
  shape: number[];
  data: number[][];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle chat completions
    if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
      try {
        const body: any = await request.json();
        const isPromptStyle = body.prompt !== undefined;

        let response: any = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
          [isPromptStyle ? "prompt" : "messages"]: isPromptStyle
            ? body.prompt
            : body.messages,
        });

        return Response.json({
          id: crypto.randomUUID(),
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "@cf/meta/llama-3.1-8b-instruct",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: response.response || response,
              },
              logprobs: null,
              finish_reason: "stop",
            },
          ],
          usage: response.usage || {
            prompt_tokens: body.messages
              ? body.messages.reduce(
                  (acc: any, msg: any) => acc + msg.content.split(" ").length,
                  0
                )
              : body.prompt.split(" ").length,
            completion_tokens: (response.response || response).split(" ")
              .length,
            total_tokens: body.messages
              ? body.messages.reduce(
                  (acc: any, msg: any) => acc + msg.content.split(" ").length,
                  0
                ) + (response.response || response).split(" ").length
              : body.prompt.split(" ").length +
                (response.response || response).split(" ").length,
          },
        });
      } catch (error: any) {
        return new Response(
          JSON.stringify({
            error: {
              message: error?.message,
              type: "invalid_request_error",
            },
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Handle embeddings
    if (
      request.method === "POST" &&
      new URL(request.url).pathname === "/v1/embeddings"
    ) {
      try {
        const body: any = await request.json();
        const input = Array.isArray(body.input) ? body.input : [body.input];

        const embeddings = await Promise.all(
          input.map(async (text: string) => {
            const response = await env.AI.run("@cf/baai/bge-small-en-v1.5", {
              text: text,
            });
            return response.data[0]; // Return full embedding data
          })
        );

        return Response.json({
          object: "list",
          data: embeddings.map((embedding, index) => ({
            object: "embedding",
            embedding: embedding, // Use complete embedding
            index,
          })),
          model: "@cf/baai/bge-small-en-v1.5",
          usage: {
            prompt_tokens: input.reduce(
              (acc: number, text: string) => acc + text.split(" ").length,
              0
            ),
            total_tokens: input.reduce(
              (acc: number, text: string) => acc + text.split(" ").length,
              0
            ),
          },
        });
      } catch (error: any) {
        return new Response(
          JSON.stringify({
            error: {
              message: error?.message,
              type: "invalid_request_error",
            },
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Handle vectorize operations
    if (request.method === "POST" && url.pathname === "/vectorize") {
      try {
        const { operation, data }: any = await request.json();

        if (operation === "insert") {
          const modelResp: EmbeddingResponse = await env.AI.run(
            "@cf/baai/bge-base-en-v1.5",
            {
              text: data,
            }
          );

          const vectors = modelResp.data.map((vector, index) => ({
            id: `${index + 1}`,
            values: vector,
          }));

          const inserted = await env.VECTORIZE.upsert(vectors);
          return Response.json(inserted);
        }

        if (operation === "query") {
          const queryVector: EmbeddingResponse = await env.AI.run(
            "@cf/baai/bge-base-en-v1.5",
            {
              text: [data],
            }
          );

          const matches = await env.VECTORIZE.query(queryVector.data[0], {
            topK: 1,
          });
          return Response.json({ matches });
        }
      } catch (error: any) {
        return new Response(
          JSON.stringify({
            error: {
              message: error?.message,
              type: "invalid_request_error",
            },
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    if (url.pathname.startsWith("/favicon")) {
      return new Response("", { status: 404 });
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
