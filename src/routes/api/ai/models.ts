import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ai/models")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const googleToken = process.env.GOOGLE_OAUTH_TOKEN ?? process.env.GOOGLE_API_KEY;
        if (!googleToken) return new Response("Missing GOOGLE_OAUTH_TOKEN or GOOGLE_API_KEY", { status: 500 });

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (process.env.GOOGLE_OAUTH_TOKEN) headers.Authorization = `Bearer ${process.env.GOOGLE_OAUTH_TOKEN}`;
        else headers["X-goog-api-key"] = process.env.GOOGLE_API_KEY as string;

        const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
          method: "GET",
          headers,
        });

        if (!res.ok) {
          const text = await res.text();
          return new Response(text || "Google models request failed", { status: res.status });
        }

        const data = await res.json();
        return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    },
  },
});
