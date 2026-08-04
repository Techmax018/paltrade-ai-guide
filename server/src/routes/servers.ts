/**
 * GET /api/v1/broker/servers — dynamic Vantage server list
 */
import { Router } from "express";

const SERVERS = [
  { id: "vantage-demo",   label: "VantageFX-Demo",              type: "demo" },
  { id: "vantage-live-1", label: "VantageInternational-Live",   type: "live" },
  { id: "vantage-live-2", label: "VantageInternational-Live 2", type: "live" },
  { id: "vantage-live-3", label: "VantageInternational-Live 3", type: "live" },
  { id: "vantage-au",     label: "VantageFX-AU-Live",           type: "live" },
];

const router = Router();

router.get("/servers", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.json({ ok: true, servers: SERVERS });
});

export default router;
