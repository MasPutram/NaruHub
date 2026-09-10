import { NextRequest, NextResponse } from "next/server";
import {
  redis,
  termuxDevicePolicyKey,
  termuxDeviceKey,
  presenceKey,
  rejoinStateKey,
  lastLaunchKey,
  PRESENCE_FRESH_S,
  REJOIN_STATE_TTL_S,
} from "@/lib/redis";

// Server-side auto-rejoin brain. The agent polls this per device; the server
// runs the whole state machine (using the in-game presence heartbeats to tell
// "in a game" from "stuck") and returns the launches the agent should perform
// right now. Gated entirely behind autoRejoinEnabled -- returns no actions
// when the operator hasn't turned it on.
//
// State machine per package (target set + auto-rejoin on + opted in + not
// paused):
//   in-game (fresh heartbeat)        -> healthy, clear state
//   stale < 300s                     -> grace, wait
//   stale >= 300s, attempt 0         -> attempt 1: rejoin to the PLACE (random server)
//   prior attempt, waited < 120s     -> still waiting for the join to land
//   prior attempt, waited >= 120s    -> failed: attempt 2/3 -> a SPECIFIC server
//                                       (Roblox server list minus the ones that failed)
//   attempts exhausted (>3)          -> give up: send HOME, stop

export const dynamic = "force-dynamic";

// Running-but-no-heartbeat = maybe loading, maybe wedged (e.g. Error 279). We
// can't read the screen to tell them apart, so we wait a grace that safely
// clears a normal load (~40s here) before force-stopping. 120s = 3x load.
const STUCK_THRESHOLD_MS = 120 * 1000;
const NOTRUNNING_GRACE_MS = 30 * 1000; // force-closed/not-open -> relaunch fast (nothing to protect)
const ESCALATE_WAIT_MS = 120 * 1000; // wait this long after an attempt before escalating
const MAX_ATTEMPTS = 3; // then give up -> home

interface RejoinState {
  staleSince: number;
  attempts: number;
  lastFiredAt: number;
  lastAckAt: number;
  failedJobIds: string[];
  lastTriedJobId: string | null;
  gaveUp: boolean;
}

function freshState(): RejoinState {
  return { staleSince: 0, attempts: 0, lastFiredAt: 0, lastAckAt: 0, failedJobIds: [], lastTriedJobId: null, gaveUp: false };
}

function parsePlaceId(target: string): string | null {
  const m = (target || "").match(/placeId=(\d+)/);
  return m ? m[1] : null;
}

// Pick a Roblox server (jobId) for `placeId` that isn't in `exclude` and has
// room. Returns null on any failure -> caller falls back to a plain place
// launch (random server).
async function pickServer(placeId: string, exclude: string[]): Promise<string | null> {
  try {
    const url = `https://games.roblox.com/v1/games/${placeId}/servers/Public?sortOrder=Asc&limit=100`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const servers: any[] = Array.isArray(data?.data) ? data.data : [];
    const excludeSet = new Set(exclude);
    const withRoom = servers.filter(
      (s) => s && s.id && !excludeSet.has(s.id) && typeof s.playing === "number" && s.playing < (s.maxPlayers || 999)
    );
    // Prefer already-populated servers (>=5 players): they have real victims and
    // are far less likely to be our own near-empty clones, so clones spread
    // across many busy servers instead of all rushing the same empty ones
    // (which caused constant hop churn -> bot-like -> facelock). Fall back to
    // any server with room if none are populated.
    const populated = withRoom.filter((s) => (s.playing || 0) >= 5);
    const pool = populated.length > 0 ? populated : withRoom;
    pool.sort((a, b) => (a.ping || 9999) - (b.ping || 9999));
    return pool.length > 0 ? String(pool[0].id) : null;
  } catch {
    return null;
  }
}

// Choose a rejoin target that AVOIDS the server the clone was just on. Roblox's
// matchmaker tends to drop a plain place-join back into the same server, so we
// always aim at a specific gameInstanceId that isn't the last-known jobId, the
// one we just tried, or any that already failed. Falls back to a plain place
// join only if the server list can't be fetched / everything's excluded.
async function chooseRejoinTarget(
  placeTarget: string,
  st: RejoinState,
  lastKnownJobId: string
): Promise<{ target: string; jobId: string | null }> {
  const placeId = parsePlaceId(placeTarget);
  if (!placeId) return { target: placeTarget, jobId: null };
  const exclude = [...st.failedJobIds];
  if (st.lastTriedJobId && !exclude.includes(st.lastTriedJobId)) exclude.push(st.lastTriedJobId);
  if (lastKnownJobId && !exclude.includes(lastKnownJobId)) exclude.push(lastKnownJobId);
  st.failedJobIds = exclude.slice(-20); // cap so it can't grow unbounded
  const jobId = await pickServer(placeId, exclude);
  if (jobId) return { target: `roblox://placeId=${placeId}&gameInstanceId=${jobId}`, jobId };
  return { target: placeTarget, jobId: null };
}

export async function GET(req: NextRequest) {
  const accessKey = process.env.ACCESS_KEY;
  const headerKey = req.headers.get("x-access-key");
  if (accessKey && headerKey !== accessKey) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId) {
    return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
  }

  try {
    const polRaw = await redis.get<string>(termuxDevicePolicyKey(deviceId));
    const policy = polRaw ? (typeof polRaw === "string" ? JSON.parse(polRaw) : polRaw) : null;
    if (!policy || !policy.autoRejoinEnabled) {
      return NextResponse.json({ ok: true, actions: [] });
    }
    const targets: Record<string, string> = policy.packageTargets || {};
    const bounds: Record<string, string> = policy.packageBounds || {};
    const optIn: string[] = Array.isArray(policy.autoRejoinPackages) ? policy.autoRejoinPackages : [];
    const optInAll = optIn.length === 0;
    const notRunningGraceMs = Math.max(1, Number(policy.rejoinDelay) || 30) * 1000;

    const devRaw = await redis.get<string>(termuxDeviceKey(deviceId));
    if (!devRaw) return NextResponse.json({ ok: true, actions: [] });
    const device = typeof devRaw === "string" ? JSON.parse(devRaw) : devRaw;
    const packages: any[] = Array.isArray(device.packages) ? device.packages : [];
    const runningSet = new Set<string>(Array.isArray(device.running) ? device.running : []);

    // Paused packages (Siap Jual etc.) -- scan the pkgpause keys.
    const pausePrefix = `termux:pkgpause:${deviceId}:`;
    const paused = new Set<string>();
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, { match: `${pausePrefix}*`, count: 100 });
      cursor = next;
      for (const k of keys) paused.add(k.slice(pausePrefix.length));
    } while (cursor !== "0");

    const now = Date.now();
    const actions: { pkg: string; target: string; bounds: string; home?: boolean }[] = [];

    for (const p of packages) {
      if (!p || typeof p !== "object" || !p.pkg || !p.username) continue;
      const pkg: string = p.pkg;
      const account: string = p.username;
      const target = targets[pkg];
      if (!target) continue; // only manage packages with a target
      if (!optInAll && !optIn.includes(pkg)) continue;
      if (paused.has(pkg)) continue;

      const presRaw = await redis.get<string>(presenceKey(deviceId, account));
      const pres = presRaw ? (typeof presRaw === "string" ? JSON.parse(presRaw) : presRaw) : null;
      const inGame = pres && pres.ts && now - pres.ts < PRESENCE_FRESH_S * 1000;

      const stRaw = await redis.get<string>(rejoinStateKey(deviceId, pkg));
      let st: RejoinState = stRaw ? { ...freshState(), ...(typeof stRaw === "string" ? JSON.parse(stRaw) : stRaw) } : freshState();

      const llRaw = await redis.get<string>(lastLaunchKey(deviceId, pkg));
      const lastLaunchAt = llRaw ? Number(llRaw) || 0 : 0;
      const lastHeartbeatAt = pres && pres.ts ? Number(pres.ts) || 0 : 0;

      const save = async () => {
        await redis.set(rejoinStateKey(deviceId, pkg), JSON.stringify(st), { ex: REJOIN_STATE_TTL_S });
      };

      if (inGame) {
        // Healthy: forget everything (this also re-arms after a give-up once
        // the clone comes back on its own).
        if (stRaw) await redis.del(rejoinStateKey(deviceId, pkg));
        continue;
      }
      if (st.gaveUp) continue;

      if (st.attempts === 0) {
        // Anchor the 300s grace on the clone's OWN launch or its last in-game
        // heartbeat -- whichever is later -- so a clone that failed early in a
        // long batch is judged from its own launch, and one that dropped after
        // playing gets a fresh grace from when it was last alive. Falls back to
        // first-observation when we have neither (launched outside the app).
        let anchor = Math.max(lastLaunchAt, lastHeartbeatAt);
        if (anchor === 0) {
          if (!st.staleSince) {
            st.staleSince = now;
            await save();
            continue;
          }
          anchor = st.staleSince;
        }
        // A clone that isn't in the running set is force-closed / never opened
        // -> nothing is loading, so relaunch fast (~30s, also the auto-boot on
        // agent start). One that IS running but silent might be mid-load -> give
        // it the full 300s before we touch it.
        const isRunning = runningSet.has(pkg);
        const graceMs = isRunning ? STUCK_THRESHOLD_MS : notRunningGraceMs;
        if (now - anchor < graceMs) {
          await save();
          continue;
        }
        // Attempt 1: rejoin to a SPECIFIC server that isn't the one it was
        // just on (avoids the matchmaker dropping it back into the same server).
        st.attempts = 1;
        {
          const choice = await chooseRejoinTarget(target, st, pres?.jobId || "");
          st.lastTriedJobId = choice.jobId;
          st.lastFiredAt = now;
          st.lastAckAt = 0;
          await save();
          actions.push({ pkg, target: choice.target, bounds: bounds[pkg] || "" });
        }
        continue;
      }

      // We've fired at least once -- are we still waiting for it to land?
      const waitFrom = st.lastAckAt || st.lastFiredAt;
      if (now - waitFrom < ESCALATE_WAIT_MS) continue;

      // The last attempt didn't land. Escalate to yet another server.
      st.attempts += 1;
      if (st.attempts > MAX_ATTEMPTS) {
        st.gaveUp = true;
        st.lastFiredAt = now;
        st.lastAckAt = 0;
        await save();
        actions.push({ pkg, target: "", bounds: bounds[pkg] || "", home: true });
        continue;
      }
      {
        const choice = await chooseRejoinTarget(target, st, pres?.jobId || "");
        st.lastTriedJobId = choice.jobId;
        st.lastFiredAt = now;
        st.lastAckAt = 0;
        await save();
        actions.push({ pkg, target: choice.target, bounds: bounds[pkg] || "" });
      }
    }

    return NextResponse.json({ ok: true, actions });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, actions: [] }, { status: 500 });
  }
}
