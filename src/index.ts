export default {
	async fetch(request, env) {
		// Handle chat completions
		if (request.method === 'POST' && new URL(request.url).pathname === '/v1/chat/completions') {
			try {
				const body: any = await request.json();
				const isPromptStyle = body.prompt !== undefined;

				let response;
				if (isPromptStyle) {
					response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
						prompt: body.prompt,
					});
				} else {
					response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
						messages: body.messages,
					});
				}

				return Response.json({
					id: crypto.randomUUID(),
					object: 'chat.completion',
					created: Math.floor(Date.now() / 1000),
					model: '@cf/meta/llama-3.1-8b-instruct',
					choices: [
						{
							index: 0,
							message: {
								role: 'assistant',
								content: response.response || response,
							},
							logprobs: null,
							finish_reason: 'stop',
						},
					],
					usage: response.usage || {
						prompt_tokens: body.messages
							? body.messages.reduce((acc: any, msg: any) => acc + msg.content.split(' ').length, 0)
							: body.prompt.split(' ').length,
						completion_tokens: (response.response || response).split(' ').length,
						total_tokens: body.messages
							? body.messages.reduce((acc: any, msg: any) => acc + msg.content.split(' ').length, 0) +
							  (response.response || response).split(' ').length
							: body.prompt.split(' ').length + (response.response || response).split(' ').length,
					},
				});
			} catch (error: any) {
				return new Response(
					JSON.stringify({
						error: {
							message: error?.message,
							type: 'invalid_request_error',
						},
					}),
					{ status: 500, headers: { 'Content-Type': 'application/json' } }
				);
			}
		}

		// Handle embeddings
		if (request.method === 'POST' && new URL(request.url).pathname === '/v1/embeddings') {
			try {
				const body: any = await request.json();
				const input = Array.isArray(body.input) ? body.input : [body.input];

				const embeddings = await Promise.all(
					input.map(async (text: string) => {
						const response = await env.AI.run('@cf/baai/bge-small-en-v1.5', {
							text: text,
						});
						return response.data[0].embedding;
					})
				);

				return Response.json({
					object: 'list',
					data: embeddings.map((embedding, index) => ({
						object: 'embedding',
						embedding,
						index,
					})),
					model: '@cf/baai/bge-small-en-v1.5',
					usage: {
						prompt_tokens: input.reduce((acc: number, text: string) => acc + text.split(' ').length, 0),
						total_tokens: input.reduce((acc: number, text: string) => acc + text.split(' ').length, 0),
					},
				});
			} catch (error: any) {
				return new Response(
					JSON.stringify({
						error: {
							message: error?.message,
							type: 'invalid_request_error',
						},
					}),
					{ status: 500, headers: { 'Content-Type': 'application/json' } }
				);
			}
		}

		return new Response('Not Found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
