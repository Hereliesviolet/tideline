// src/index.ts

import express from "express";
import cors from "cors";
import client from "prom-client";

// Unsere modularen Routen
import usersRouter from "./routes/users";
import activitiesRouter from "./routes/activities";
import timelineRouter from "./routes/timeline";
import schedulesRouter from "./routes/schedules";
import authRouter from "./routes/auth";
import sessionsRouter from "./routes/sessions";
import adminRouter from "./routes/admin";
import avatarsRouter from "./routes/avatars";
import schedule from "node-schedule";
import { syncFull, syncFrequent, checkAndRunFullSyncIfStale } from "./jobs/syncCore";

const app = express();

// The worker publishes no host port and is only reachable from Docker networks
// (behind the bundled Caddy). Trust all private ranges as proxies so that req.ip,
// and therefore express-rate-limit, works per client instead of per proxy,
// regardless of which subnet Docker assigns to the project.
app.set("trust proxy", "loopback, uniquelocal");

// Basis-Middleware
app.disable("x-powered-by");
const corsOrigins = [
  "http://127.0.0.1:8080",
  "http://localhost:8080",
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.replace(/\/+$/, "")] : []),
];
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));
app.use(express.json());

// ---- Prometheus / Health ----
const register = new client.Registry();
client.collectDefaultMetrics({ register });

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "worker", time: new Date().toISOString() });
});

app.get("/metrics", (req, res, next) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? "";
  const normalized = ip.replace(/^::ffff:/, "");
  if (normalized !== "127.0.0.1" && normalized !== "::1") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
}, async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// ---- API-Routen ----
// Alle Routen aus den Routern hängen unter /api
// -> router.get("/users") => /api/users
// -> router.get("/activities") => /api/activities
// -> router.get("/timeline") => /api/timeline
// -> router.get("/projects") => /api/projects

app.use("/api/auth", authRouter);
app.use("/api", sessionsRouter);
app.use("/api/admin", adminRouter);
app.use("/api", usersRouter);
app.use("/api", activitiesRouter);
app.use("/api", timelineRouter);
app.use("/api", schedulesRouter);
app.use("/api", avatarsRouter);

// (Optional: Wenn du später noch weitere Router hast, hier dranhängen)
// import absencesRouter from "./routes/absences";
// app.use("/api", absencesRouter);
// usw.

// ---- Start ----
const port = Number(process.env.PORT || 9100);

app.listen(port, "0.0.0.0", () => {
  console.log(`Worker listening on 0.0.0.0:${port}`);
});

const SYNC_ENABLED = process.env.SYNC_ENABLED !== "false";

const hasMocoConfig =
  (!!process.env.MOCO_BASE_URL || !!process.env.MOCO_BASE) &&
  (!!process.env.MOCO_API_KEY ||
    !!process.env.MOCO_API_TOKEN ||
    !!process.env.MOCO_TOKEN);

async function runFrequentSync() {
  try {
    await syncFrequent();
  } catch (err) {
    console.error("[sync] frequent sync failed", err);
  }
}

async function runFullSync() {
  try {
    await syncFull();
  } catch (err) {
    console.error("[sync] full sync failed", err);
  }
}

if (SYNC_ENABLED && hasMocoConfig) {
  // ── Startup ──────────────────────────────────────────────────────────────
  // Sequenziell: erst Frequent (aktuelle Activities), dann Full (Users/Projects) wenn stale.
  // Kein paralleles Starten – verhindert MOCO Rate-Limit-Probleme.
  (async () => {
    await runFrequentSync();
    await checkAndRunFullSyncIfStale(60 * 60 * 1000);
  })().catch(() => undefined);

  // ── Häufiger Sync alle 15 Minuten (Activities, Schedules, Planning) ──────
  schedule.scheduleJob("*/15 * * * *", () => {
    runFrequentSync().catch(() => undefined);
  });

  // ── Täglicher Full-Sync um 02:07 Uhr (Europe/Berlin) ────────────────────
  // Nicht 02:00: dort startet auch der */15-Frequent-Sync und hält den syncLock,
  // der Full-Sync würde dann jede Nacht übersprungen.
  schedule.scheduleJob({ hour: 2, minute: 7, tz: "Europe/Berlin" }, () => {
    runFullSync().catch(() => undefined);
  });

  console.log(
    "[sync] enabled – frequent sync every 15min (cron), full sync daily at 02:07 Europe/Berlin"
  );
} else {
  console.warn(
    "[sync] automatic sync disabled (missing MOCO config or SYNC_ENABLED=false)"
  );
}
