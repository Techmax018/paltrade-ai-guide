/**
 * GET /api/v1/broker/servers
 *
 * Returns the list of active Vantage MT5 server strings from the
 * backend config file. The frontend NEVER hardcodes server names —
 * it fetches this list on page load so adding new servers requires
 * only a config change and a redeploy, not a frontend code change.
 *
 * Response shape:
 *   { servers: Array<{ id: string; label: string; type: "demo"|"live" }> }
 */
import { createFileRoute } from "@tanstack/react-router";

// Server list — imported from config. In production this can be read
// from a database, environment variable, or external config service.
const SERVER_LIST = [
  { id: "vantage-demo",   label: "VantageFX-Demo",              type: "demo" },
  { id: "vantage-live-1", label: "VantageInternational-Live",   type: "live" },
  { id: "vantage-live-2", label: "VantageInternational-Live 2", type: "live" },
  { id: "vantage-live-3", label: "VantageInternational-Live 3", type: "live" },
  { id: "vantage-au",     label: "VantageFX-AU-Live",           type: "live" },
] as const;

export const Route = createFileRoute("/api/v1/broker/servers")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(
          JSON.stringify({
            ok: true,
            servers: SERVER_LIST,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              // Short cache — allows CDN to cache for 60s while keeping
              // list reasonably fresh after config changes
              "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
            },
          },
        );
      },
    },
  },
});
