import { createFileRoute } from "@tanstack/react-router";

/**
 * Lovable AI strategy advisor.
 * Takes a live market snapshot from the terminal and returns a structured
 * recommendation: which strategy fits right now, and WHEN to take the trade.
 */

interface SnapshotBody {
  symbol?: string;
  timeframe?: string;
  price?: number;
  analysis?: Record<string, unknown>;
  recentCandles?: { o: number; h: number; l: number; c: number }[];
  balance?: number;
  clientTimeUtc?: string;
}

const SCHEMA = {
  name: "strategy_recommendation",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "bestStrategy",
      "direction",
      "timing",
      "timingReason",
      "entryWindow",
      "sessionNote",
      "confidence",
      "checklist",
      "invalidation",
      "riskNote",
    ],
    properties: {
      bestStrategy: { type: "string" },
      direction: { type: "string", enum: ["BUY", "SELL", "STAND_ASIDE"] },
      timing: { type: "string", enum: ["TAKE_NOW", "WAIT_FOR_TRIGGER", "AVOID"] },
      timingReason: { type: "string" },
      entryWindow: { type: "string" },
      sessionNote: { type: "string" },
      confidence: { type: "integer" },
      checklist: { type: "array", items: { type: "string" } },
      invalidation: { type: "string" },
      riskNote: { type: "string" },
    },
  },
} as const;

export const Route = createFileRoute("/api/ai/strategy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;

        let body: SnapshotBody;
        try {
          body = (await request.json()) as SnapshotBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const nowUtc = new Date().toISOString();
        const snapshot = {
          symbol: body.symbol ?? "unknown",
          timeframe: body.timeframe ?? "M5",
          price: body.price ?? null,
          balance: body.balance ?? null,
          serverTimeUtc: nowUtc,
          clientTimeUtc: body.clientTimeUtc ?? nowUtc,
          analysis: body.analysis ?? {},
          recentCandles: (body.recentCandles ?? []).slice(-40),
        };

        // If LOVABLE_API_KEY is provided, keep using Lovable gateway
        if (key) {
          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
            body: JSON.stringify({
              model: "google/gemini-3.6-flash",
              messages: [
                {
                  role: "system",
                  content:
                    "You are PalTrade AI, a disciplined forex & synthetic-index strategy analyst. " +
                    "You receive a live market snapshot (indicators, structure, FVGs, fib levels, recent candles) " +
                    "and must choose the single best-fitting strategy right now (e.g. trend continuation with EMA pullback, " +
                    "BOS + FVG retest, range fade at support/resistance, RSI divergence reversal, breakout retest) and judge TIMING: " +
                    "whether to take the trade now, wait for a specific trigger, or avoid. " +
                    "Consider the UTC time vs trading sessions (Sydney/Tokyo/London/New York, London-NY overlap) — synthetic indices trade 24/7. " +
                    "Be honest: if confluence is weak, say STAND_ASIDE / AVOID. Never promise profits. Keep every field short and concrete. " +
                    "confidence is 0-100. checklist has 3-5 short conditions to verify before entering.",
                },
                {
                  role: "user",
                  content:
                    "Market snapshot JSON:\n" +
                    JSON.stringify(snapshot) +
                    "\n\nReturn the best strategy and precise timing guidance.",
                },
              ],
              response_format: { type: "json_schema", json_schema: SCHEMA },
            }),
          });

          if (!res.ok) {
            const text = await res.text();
            if (res.status === 429)
              return new Response("Rate limit reached — try again shortly.", { status: 429 });
            if (res.status === 402)
              return new Response("AI credits exhausted — add credits to continue.", { status: 402 });
            return new Response(text || "AI request failed", { status: res.status });
          }

          const data = (await res.json()) as {
            choices?: { message?: { content?: string } }[];
          };
          const raw = data.choices?.[0]?.message?.content ?? "";
          try {
            return Response.json(JSON.parse(raw));
          } catch {
            return new Response("AI returned an unreadable response", { status: 502 });
          }
        }

        // Otherwise, call Google Generative API (Gemini) directly
        const googleModel = process.env.GOOGLE_MODEL;
        const googleToken = process.env.GOOGLE_OAUTH_TOKEN ?? process.env.GOOGLE_API_KEY;
        if (!googleToken)
          return new Response(
            "Missing AI configuration (set LOVABLE_API_KEY or GOOGLE_API_KEY/GOOGLE_OAUTH_TOKEN)",
            { status: 500 },
          );
        if (!googleModel)
          return new Response(
            "Missing GOOGLE_MODEL environment variable — set to the model resource name (e.g. 'models/gemini-1' or 'models/text-bison-001')",
            { status: 500 },
          );

        const prompt = `You are PalTrade AI, a disciplined forex & synthetic-index strategy analyst.\nReturn a JSON object matching the following schema exactly (no extra text): ${JSON.stringify(
          SCHEMA.schema,
        )}\nSnapshot: ${JSON.stringify(snapshot)}`;

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (process.env.GOOGLE_OAUTH_TOKEN) headers.Authorization = `Bearer ${process.env.GOOGLE_OAUTH_TOKEN}`;
        else headers["X-goog-api-key"] = process.env.GOOGLE_API_KEY as string;

        async function tryGenerate(modelName: string) {
          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
            },
          );
          return r;
        }

        // Try configured model first, then fallback to listing models and attempting sensible candidates
        let gres = await tryGenerate(googleModel);
        if (!gres.ok) {
          const text = await gres.text();
          const bodyText = text || "Google Generative API error";

          // If model not found / unsupported, attempt to list available models and retry
          if (gres.status === 404 || /not found|not supported/i.test(bodyText)) {
            const listRes = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
              method: "GET",
              headers,
            });

            if (listRes.ok) {
              const listBody = await listRes.json();
              const available: string[] = (listBody.models ?? []).map((m: any) => m.name).filter(Boolean);

              // Prioritize Gemini, then Bison/text models
              const candidates = [
                ...new Set([
                  ...available.filter((n) => /gemini/i.test(n)),
                  ...available.filter((n) => /bison|text/i.test(n)),
                ]),
              ];

              for (const candidate of candidates) {
                gres = await tryGenerate(candidate);
                if (gres.ok) {
                  break;
                }
              }
            } else {
              return new Response(await listRes.text() || "Failed to list Google models", { status: listRes.status });
            }
          } else {
            return new Response(bodyText, { status: gres.status });
          }
        }

        if (!gres.ok) {
          const t = await gres.text();
          return new Response(t || "Google Generative API error", { status: gres.status });
        }

        const gbody = await gres.json();
        const candidates = gbody.candidates ?? gbody.output?.candidates ?? [];
        let text = "";
        if (Array.isArray(candidates) && candidates.length) {
          const c = candidates[0];
          if (Array.isArray(c.content)) text = c.content.map((p: any) => p.text || "").join("");
          else if (Array.isArray(c.output)) text = c.output.map((o: any) => (Array.isArray(o.content) ? o.content.map((p: any) => p.text || "").join("") : "")).join("");
          else text = JSON.stringify(c);
        } else {
          text = JSON.stringify(gbody);
        }

        const match = text.match(/\{[^]*\}/);
        if (!match) return new Response("AI returned unexpected format", { status: 502 });
        try {
          return Response.json(JSON.parse(match[0]));
        } catch {
          return new Response("AI returned unreadable JSON", { status: 502 });
        }
      },
    },
  },
});
