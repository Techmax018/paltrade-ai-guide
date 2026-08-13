export function openAIStream(model: string, prompt: string): ReadableStream<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY environment variable");

  const modelName = model.replace(/^openai\//, "");

  const encoder = new TextEncoder();

  const stream = new ReadableStream<string>({
    async start(controller) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: "user", content: prompt }],
          stream: true,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        controller.error(new Error(`OpenAI error: ${res.status} ${text}`));
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          // Forward raw chunk; caller can parse SSE/json fragments as needed
          controller.enqueue(chunk);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        reader.releaseLock();
      }
    },
    cancel() {},
  });

  return stream;
}

export type StreamProvider = (model: string, prompt: string) => ReadableStream<string>;

export const streamText: StreamProvider = (model, prompt) => {
  if (model.startsWith("openai/")) return openAIStream(model, prompt);
  throw new Error("Unsupported model provider for streaming");
};
