import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "../../../lib/streamText";

export const Route = createFileRoute("/api/ai/stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { model?: string; prompt?: string };
        try {
          body = (await request.json()) as { model?: string; prompt?: string };
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const model = body.model ?? "";
        const prompt = body.prompt ?? "";
        if (!model || !prompt) return new Response("Missing model or prompt", { status: 400 });

        try {
          const stream = streamText(model, prompt);
          return new Response(stream as any, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream;charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
            },
          });
        } catch (err: any) {
          return new Response(err?.message ?? "Stream error", { status: 500 });
        }
      },
    },
  },
});
