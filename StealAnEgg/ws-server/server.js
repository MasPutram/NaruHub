const { WebSocketServer } = require("ws");
const Redis = require("ioredis");

const PORT = parseInt(process.env.WS_PORT || "8080", 10);
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const ACCESS_KEY = process.env.ACCESS_KEY || "NARUHUB-PREMIUM-505";

const redis = new Redis(REDIS_URL);

// ─── Connected clients ───
// deviceId -> ws
const devices = new Map();
// sessionId -> ws (dashboard viewers)
const dashboards = new Map();

const wss = new WebSocketServer({ port: PORT });

console.log(`[NaruHub WS] listening on port ${PORT}`);

wss.on("connection", (ws, req) => {
  let clientType = null; // "device" or "dashboard"
  let clientId = null;
  let alive = true;

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ error: "invalid json" }));
      return;
    }

    const { type } = msg;

    // ─── Auth ───
    if (type === "auth") {
      if (msg.accessKey !== ACCESS_KEY) {
        ws.send(JSON.stringify({ type: "auth", ok: false, error: "invalid key" }));
        ws.close(4001, "unauthorized");
        return;
      }

      if (msg.role === "device") {
        clientType = "device";
        clientId = msg.deviceId;
        devices.set(clientId, ws);
        ws.send(JSON.stringify({ type: "auth", ok: true }));
        console.log(`[+] device ${clientId} connected`);
      } else if (msg.role === "dashboard") {
        clientType = "dashboard";
        clientId = "dash-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
        dashboards.set(clientId, ws);
        ws.send(JSON.stringify({ type: "auth", ok: true }));
        console.log(`[+] dashboard ${clientId} connected`);
      }
      return;
    }

    if (!clientType) {
      ws.send(JSON.stringify({ error: "auth required" }));
      return;
    }

    // ─── Device messages ───
    if (clientType === "device") {
      if (type === "heartbeat") {
        // Store in Redis (same format as HTTP heartbeat)
        const deviceKey = `termux:device:${clientId}`;
        const deviceData = {
          deviceId: clientId,
          packages: msg.packages || [],
          screen: msg.screen || null,
          stats: msg.stats || null,
          hostname: msg.hostname || "",
          lastSeen: Date.now(),
        };
        await redis.set(deviceKey, JSON.stringify(deviceData), "EX", 300);
        ws.send(JSON.stringify({ type: "heartbeat", ok: true }));

        // Broadcast to dashboards
        broadcast("dashboard", {
          type: "device:update",
          device: deviceData,
        });
      }

      if (type === "register") {
        const deviceKey = `termux:device:${clientId}`;
        const deviceData = {
          deviceId: clientId,
          hostname: msg.hostname || "",
          platform: msg.platform || "",
          registeredAt: Date.now(),
          lastSeen: Date.now(),
        };
        await redis.set(deviceKey, JSON.stringify(deviceData), "EX", 300);
        ws.send(JSON.stringify({ type: "register", ok: true }));
        console.log(`[*] device ${clientId} registered`);
      }
    }

    // ─── Dashboard messages ───
    if (clientType === "dashboard") {
      if (type === "command") {
        // Forward command to specific device
        const targetDevice = devices.get(msg.deviceId);
        if (targetDevice && targetDevice.readyState === 1) {
          targetDevice.send(JSON.stringify({
            type: "command",
            commands: msg.commands || [],
          }));
          ws.send(JSON.stringify({ type: "command", ok: true, deviceId: msg.deviceId }));

          // Log command
          const logKey = `termux:cmdlog:${msg.deviceId}`;
          const logEntry = {
            id: Date.now() + "-" + Math.random().toString(36).slice(2, 6),
            ts: Date.now(),
            action: msg.action || "command",
            packages: msg.packages || [],
          };
          const pipe = redis.pipeline();
          pipe.rpush(logKey, JSON.stringify(logEntry));
          pipe.ltrim(logKey, -30, -1);
          pipe.expire(logKey, 86400);
          await pipe.exec();
        } else {
          ws.send(JSON.stringify({ type: "command", ok: false, error: "device offline" }));
        }
      }

      if (type === "list-devices") {
        // Scan Redis for all online devices
        const deviceList = [];
        let cursor = "0";
        do {
          const [next, keys] = await redis.scan(cursor, "MATCH", "termux:device:*", "COUNT", 100);
          cursor = next;
          if (keys.length > 0) {
            const values = await redis.mget(...keys);
            for (const v of values) {
              if (v) {
                try {
                  const d = JSON.parse(v);
                  d.wsOnline = devices.has(d.deviceId);
                  deviceList.push(d);
                } catch {}
              }
            }
          }
        } while (cursor !== "0");
        ws.send(JSON.stringify({ type: "list-devices", devices: deviceList }));
      }
    }
  });

  // Ping/pong keepalive
  ws.on("pong", () => { alive = true; });

  ws.on("close", () => {
    if (clientType === "device" && clientId) {
      devices.delete(clientId);
      console.log(`[-] device ${clientId} disconnected`);
      broadcast("dashboard", { type: "device:offline", deviceId: clientId });
    }
    if (clientType === "dashboard" && clientId) {
      dashboards.delete(clientId);
      console.log(`[-] dashboard ${clientId} disconnected`);
    }
  });

  ws.on("error", (err) => {
    console.error(`[!] ws error:`, err.message);
  });
});

// Keepalive ping every 30s
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.alive) { ws.terminate(); return; }
    ws.alive = false;
    ws.ping();
  });
}, 30000);

function broadcast(target, msg) {
  const data = JSON.stringify(msg);
  if (target === "dashboard") {
    for (const [, ws] of dashboards) {
      if (ws.readyState === 1) ws.send(data);
    }
  } else if (target === "device") {
    for (const [, ws] of devices) {
      if (ws.readyState === 1) ws.send(data);
    }
  }
}

process.on("SIGINT", () => {
  console.log("\n[NaruHub WS] shutting down...");
  wss.close();
  redis.disconnect();
  process.exit(0);
});
