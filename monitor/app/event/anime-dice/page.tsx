"use client";

import { useCallback, useEffect, useState } from "react";

interface EventBuff {
  bucket?: string;
  amount?: number;
}

interface ActiveEvent {
  name: string;
  duration: number;
  startedAt: number;
  remaining: number;
  buffs?: Record<string, EventBuff> | null;
  jobId?: string | null;
  placeId?: number | string | null;
  reportedBy?: string;
  reportedAt?: number;
}

interface EventsResponse {
  ok: boolean;
  event: ActiveEvent | null;
  history?: ActiveEvent[];
}

interface ADAccount {
  sourceAccount: string;
  jobId?: string | null;
  online?: boolean;
  dice?: string | null;
  rebirth?: number | null;
}

interface TermuxPackage {
  package?: string;
  username?: string;
}

interface TermuxDevice {
  deviceId: string;
  hostname?: string;
  customName?: string;
  packages?: TermuxPackage[];
  status?: string;
}

const AD_PLACE_ID = 113290951185459;

// Known events — color + accent per name so cards stay recognizable at a glance
const EVENT_STYLE: Record<string, { color: string; emoji: string; blurb: string }> = {
  "Luck Event": { color: "#34d399", emoji: "\u{1F340}", blurb: "Chance luck ×2.5" },
  "Cash Event": { color: "#fbbf24", emoji: "\u{1F4B0}", blurb: "Money multiplier ×2.5" },
  "Roll Speed Event": { color: "#38bdf8", emoji: "\u{26A1}", blurb: "Roll duration ×0.5 (lebih cepat)" },
  "Trait Event": { color: "#a855f7", emoji: "\u{1F3AD}", blurb: "Trait luck ×2" },
  "Grade Event": { color: "#f87171", emoji: "\u{1F31F}", blurb: "Grade luck ×2" },
};

function styleFor(name: string) {
  return EVENT_STYLE[name] || { color: "#818cf8", emoji: "\u{2728}", blurb: "" };
}

function fmtDuration(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function fmtAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s lalu`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j lalu`;
  return `${Math.floor(h / 24)}h lalu`;
}

export default function AnimeDiceEventPage() {
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<EventsResponse | null>(null);
  const [accounts, setAccounts] = useState<ADAccount[]>([]);
  const [devices, setDevices] = useState<TermuxDevice[]>([]);
  const [tick, setTick] = useState(0); // local 1s tick for countdown

  const fetchEvent = useCallback(async () => {
    try {
      const [eRes, aRes, dRes] = await Promise.all([
        fetch("/api/anime-dice/events", { cache: "no-store" }),
        fetch("/api/anime-dice/accounts", { cache: "no-store" }),
        fetch("/api/termux/devices", { cache: "no-store" }),
      ]);
      const [eBody, aBody, dBody] = await Promise.all([eRes.json(), aRes.json(), dRes.json()]);
      setData(eBody);
      if (Array.isArray(aBody?.accounts)) setAccounts(aBody.accounts);
      if (Array.isArray(dBody?.devices)) setDevices(dBody.devices);
    } catch {}
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchEvent();
    const poll = setInterval(fetchEvent, 10000);
    const localTick = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(localTick);
    };
  }, [fetchEvent]);

  if (!mounted) return null;

  const event = data?.event || null;
  const history = data?.history || [];

  // Client-side countdown — reduce remaining by seconds elapsed since fetch
  const serverReportedAt = event?.reportedAt || 0;
  const localElapsed = serverReportedAt
    ? Math.max(0, Math.floor(Date.now() / 1000) - serverReportedAt)
    : 0;
  const remaining = event ? Math.max(0, (event.remaining || 0) - localElapsed) : 0;
  const progress = event && event.duration
    ? Math.min(100, Math.max(0, ((event.duration - remaining) / event.duration) * 100))
    : 0;

  const st = event ? styleFor(event.name) : null;

  // Join links — same place, server-specific when we have jobId
  const privateServerUrl = event?.jobId
    ? `https://www.roblox.com/games/start?placeId=${AD_PLACE_ID}&gameInstanceId=${event.jobId}`
    : null;
  const publicJoinUrl = `https://www.roblox.com/games/${AD_PLACE_ID}`;
  const robloxDeepLink = event?.jobId
    ? `roblox://experiences/start?placeId=${AD_PLACE_ID}&gameInstanceId=${event.jobId}`
    : `roblox://experiences/start?placeId=${AD_PLACE_ID}`;
  const browserJoinJs = event?.jobId
    ? `Roblox.GameLauncher.joinGameInstance(${AD_PLACE_ID}, "${event.jobId}")`
    : `Roblox.GameLauncher.joinMultiplayerGame(${AD_PLACE_ID})`;
  const execTeleport = event?.jobId
    ? `game:GetService("TeleportService"):TeleportToPlaceInstance(${AD_PLACE_ID}, "${event.jobId}")`
    : `game:GetService("TeleportService"):Teleport(${AD_PLACE_ID})`;

  return (
    <>
      <style>{styles}</style>
      <div className="page">
        <div className="topbar">
          <h1>Server Event — Anime Dice</h1>
          <button className="refresh-btn" onClick={fetchEvent} title="Refresh">
            &#x21BB;
          </button>
        </div>

        {!event ? (
          <div className="idle">
            <div className="idle-emoji">&#x1F4A4;</div>
            <div className="idle-title">Belum ada event aktif</div>
            <div className="idle-sub">
              Monitoring agent nunggu client lapor <code>ActiveWeather</code>. Event random muncul tiap 15-30 menit, durasi 5 menit.
            </div>
          </div>
        ) : (
          <div className="event-card" style={{ borderColor: st!.color, ["--accent" as any]: st!.color }}>
            <div className="ev-head">
              <div className="ev-emoji" style={{ background: st!.color + "22" }}>{st!.emoji}</div>
              <div className="ev-info">
                <div className="ev-name" style={{ color: st!.color }}>{event.name}</div>
                <div className="ev-blurb">{st!.blurb}</div>
              </div>
              <div className="ev-timer">
                <div className="ev-timer-lbl">SISA</div>
                <div className="ev-timer-val" style={{ color: st!.color }}>{fmtDuration(remaining)}</div>
              </div>
            </div>

            <div className="ev-progress">
              <div className="ev-progress-bar" style={{ width: progress + "%", background: st!.color }} />
            </div>

            {event.buffs && Object.keys(event.buffs).length > 0 && (
              <div className="ev-buffs">
                {Object.entries(event.buffs).map(([k, v]) => (
                  <div key={k} className="ev-buff">
                    <span className="buff-k">{k}</span>
                    <span className="buff-v" style={{ color: st!.color }}>×{v.amount}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="ev-meta">
              {event.reportedBy && <span>Reported by <b>{event.reportedBy}</b></span>}
              {event.jobId && <span>Server: <code>{event.jobId.slice(0, 8)}…</code></span>}
              <span>Started {fmtAgo(event.startedAt || event.reportedAt || 0)}</span>
            </div>

            {event.jobId && (
              <div className="ev-joins">
                <div className="joins-title">JOIN SERVER INI</div>
                <div className="joins-grid">
                  {privateServerUrl && (
                    <a className="join-btn web" href={privateServerUrl} target="_blank" rel="noopener">
                      <span className="jb-ico">&#x1F310;</span>
                      <div>
                        <div className="jb-lbl">PC / Web Browser</div>
                        <div className="jb-sub">buka Roblox app via browser</div>
                      </div>
                    </a>
                  )}
                  <a className="join-btn mobile" href={robloxDeepLink}>
                    <span className="jb-ico">&#x1F4F1;</span>
                    <div>
                      <div className="jb-lbl">Mobile App (deep link)</div>
                      <div className="jb-sub">tap buka Roblox app</div>
                    </div>
                  </a>
                  <button className="join-btn copy" onClick={() => { navigator.clipboard?.writeText(execTeleport); }} title="Copy teleport script">
                    <span className="jb-ico">&#x1F3AE;</span>
                    <div>
                      <div className="jb-lbl">Executor Teleport (copy)</div>
                      <div className="jb-sub">paste di executor di game lain</div>
                    </div>
                  </button>
                  <button className="join-btn copy" onClick={() => { navigator.clipboard?.writeText(browserJoinJs); }} title="Copy browser console join">
                    <span className="jb-ico">&#x1F310;</span>
                    <div>
                      <div className="jb-lbl">Browser Console (copy)</div>
                      <div className="jb-sub">paste di DevTools roblox.com</div>
                    </div>
                  </button>
                </div>
                <div className="joins-hint">
                  PlaceId: <code>{AD_PLACE_ID}</code>
                  {event.jobId && <> &middot; JobId: <code>{event.jobId}</code></>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Server Map — group online accounts by jobId */}
        <ServerMap accounts={accounts} devices={devices} activeJobId={event?.jobId || null} />

        <div className="hist">
          <div className="hist-title">EVENT HISTORY <span>{history.length}</span></div>
          {history.length === 0 ? (
            <div className="hist-empty">Belum ada event tercatat.</div>
          ) : (
            <div className="hist-list">
              {history.map((ev, i) => {
                const s = styleFor(ev.name);
                return (
                  <div key={i} className="hist-row" style={{ borderLeftColor: s.color }}>
                    <span className="hr-emoji">{s.emoji}</span>
                    <span className="hr-name" style={{ color: s.color }}>{ev.name}</span>
                    <span className="hr-dur">{Math.round((ev.duration || 0) / 60)}m</span>
                    <span className="hr-ago">{fmtAgo(ev.startedAt || ev.reportedAt || 0)}</span>
                    {ev.reportedBy && <span className="hr-by">by {ev.reportedBy}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ServerMap({ accounts, devices, activeJobId }: { accounts: ADAccount[]; devices: TermuxDevice[]; activeJobId: string | null }) {
  // Build username → device-name map
  const deviceByUser = new Map<string, string>();
  devices.forEach((d) => {
    const label = d.customName || d.hostname || d.deviceId.slice(0, 8);
    (d.packages || []).forEach((p) => {
      if (p?.username) deviceByUser.set(p.username, label);
    });
  });

  // Group accounts by jobId (only online, only with a jobId)
  const groups = new Map<string, ADAccount[]>();
  accounts.forEach((a) => {
    if (!a.online) return;
    const jid = a.jobId;
    if (!jid) return;
    const arr = groups.get(jid) || [];
    arr.push(a);
    groups.set(jid, arr);
  });

  // Sort: active-event server first, then by headcount desc
  const entries = Array.from(groups.entries()).sort((a, b) => {
    if (a[0] === activeJobId) return -1;
    if (b[0] === activeJobId) return 1;
    return b[1].length - a[1].length;
  });

  const [copied, setCopied] = useState<string | null>(null);
  function copyTeleport(jobId: string) {
    const script = `game:GetService("TeleportService"):TeleportToPlaceInstance(${AD_PLACE_ID}, "${jobId}", game.Players.LocalPlayer)`;
    navigator.clipboard?.writeText(script);
    setCopied(jobId);
    setTimeout(() => setCopied((c) => (c === jobId ? null : c)), 2000);
  }

  return (
    <div className="smap">
      <div className="smap-title">
        SERVER MAP <span>{entries.length} server &middot; {Array.from(groups.values()).reduce((s, a) => s + a.length, 0)} akun</span>
      </div>
      {entries.length === 0 ? (
        <div className="smap-empty">Belum ada akun online dengan jobId tercatat.</div>
      ) : (
        <div className="smap-list">
          {entries.map(([jobId, accs], idx) => {
            const isActive = jobId === activeJobId;
            return (
              <div key={jobId} className={`smap-server ${isActive ? "active" : ""}`}>
                <div className="ss-head">
                  <div className="ss-title">
                    <span className="ss-idx">Server #{idx + 1}</span>
                    {isActive && <span className="ss-badge">EVENT HERE</span>}
                  </div>
                  <button
                    className="ss-copy"
                    onClick={() => copyTeleport(jobId)}
                    title="Copy teleport script"
                  >
                    {copied === jobId ? "✓ Copied" : "\u{1F4CB} Copy Teleport"}
                  </button>
                </div>
                <div className="ss-jobid">{jobId}</div>
                <div className="ss-accs">
                  {accs.map((a) => (
                    <div key={a.sourceAccount} className="ss-acc">
                      <span className="ss-acc-name">{a.sourceAccount}</span>
                      <span className="ss-arrow">&rarr;</span>
                      <span className="ss-acc-dev">{deviceByUser.get(a.sourceAccount) || "?"}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = `
* { box-sizing: border-box; margin: 0; padding: 0; }
.page {
  min-height: 100vh;
  background: #0b0b14;
  color: #e8e8f0;
  padding: 24px;
  max-width: 960px;
  margin: 0 auto;
  font-family: var(--font-poppins), -apple-system, "Segoe UI", Roboto, sans-serif;
}

.topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.topbar h1 { font-size: 14px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #cbd5e1; }
.refresh-btn {
  background: #1c1c2b; color: #e8e8f0; border: 1px solid #262636;
  width: 36px; height: 36px; border-radius: 8px; cursor: pointer; font-size: 18px;
}
.refresh-btn:hover { background: #262636; }

/* Idle state */
.idle {
  text-align: center;
  padding: 80px 24px;
  background: #14141f;
  border: 1px solid #262636;
  border-radius: 16px;
}
.idle-emoji { font-size: 56px; margin-bottom: 16px; opacity: .5; }
.idle-title { font-size: 18px; font-weight: 800; color: #cbd5e1; margin-bottom: 8px; }
.idle-sub { font-size: 13px; color: #71717a; line-height: 1.6; max-width: 440px; margin: 0 auto; }
.idle-sub code { background: #1c1c2b; padding: 2px 6px; border-radius: 4px; font-family: var(--font-numbers), monospace; color: #a78bfa; }

/* Event card */
.event-card {
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, #15152a), #15152a);
  border: 2px solid;
  border-radius: 20px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 0 32px color-mix(in srgb, var(--accent) 20%, transparent);
}
.ev-head { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
.ev-emoji {
  width: 64px; height: 64px; border-radius: 16px;
  display: flex; align-items: center; justify-content: center;
  font-size: 32px; flex-shrink: 0;
}
.ev-info { flex: 1; min-width: 0; }
.ev-name { font-size: 24px; font-weight: 900; letter-spacing: .3px; }
.ev-blurb { font-size: 13px; color: #94a3b8; font-weight: 600; margin-top: 2px; }
.ev-timer { text-align: right; }
.ev-timer-lbl { font-size: 10px; font-weight: 800; color: #71717a; letter-spacing: 1px; }
.ev-timer-val { font-size: 36px; font-weight: 900; font-family: var(--font-numbers), monospace; letter-spacing: .5px; line-height: 1; }

.ev-progress { height: 6px; background: #1c1c2b; border-radius: 3px; overflow: hidden; margin-bottom: 20px; }
.ev-progress-bar { height: 100%; transition: width 1s linear; border-radius: 3px; }

.ev-buffs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.ev-buff {
  background: #1c1c2b; border: 1px solid #262636; border-radius: 8px;
  padding: 8px 14px; display: flex; align-items: center; gap: 10px;
}
.buff-k { font-size: 12px; font-weight: 700; color: #cbd5e1; }
.buff-v { font-size: 16px; font-weight: 900; font-family: var(--font-numbers), monospace; }

.ev-meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 11px; color: #71717a; font-weight: 600; margin-bottom: 20px; padding-top: 16px; border-top: 1px solid #262636; }
.ev-meta code { background: #1c1c2b; padding: 2px 6px; border-radius: 4px; font-family: var(--font-numbers), monospace; color: #a78bfa; font-size: 10px; }
.ev-meta b { color: #e8e8f0; font-weight: 800; }

/* Join buttons */
.ev-joins { background: #0b0b14; border: 1px solid #262636; border-radius: 12px; padding: 16px; }
.joins-title { font-size: 11px; font-weight: 900; color: #facc15; letter-spacing: 1.5px; margin-bottom: 12px; }
.joins-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; }
.join-btn {
  display: flex; align-items: center; gap: 12px;
  background: #14141f; border: 1px solid #262636; border-radius: 10px;
  padding: 12px 14px; color: #e8e8f0; cursor: pointer; text-decoration: none;
  font-family: inherit; text-align: left; transition: all .12s;
}
.join-btn:hover { background: #1c1c2b; border-color: #3f3f46; }
.jb-ico { font-size: 22px; flex-shrink: 0; }
.jb-lbl { font-size: 12px; font-weight: 800; color: #e8e8f0; }
.jb-sub { font-size: 10px; color: #71717a; font-weight: 600; margin-top: 1px; }
.joins-hint { margin-top: 12px; font-size: 10px; color: #71717a; font-family: var(--font-numbers), monospace; word-break: break-all; }
.joins-hint code { color: #a78bfa; }

/* History */
.hist-title { font-size: 11px; font-weight: 800; color: #71717a; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
.hist-title span { background: #1c1c2b; color: #e8e8f0; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 900; }
.hist-empty { color: #71717a; font-size: 12px; text-align: center; padding: 24px; background: #14141f; border: 1px dashed #262636; border-radius: 10px; }
.hist-list { display: flex; flex-direction: column; gap: 4px; }
.hist-row {
  display: flex; align-items: center; gap: 12px;
  background: #14141f; border-left: 3px solid; border-radius: 6px;
  padding: 10px 14px; font-size: 12px;
}
.hr-emoji { font-size: 16px; }
.hr-name { font-weight: 800; min-width: 140px; }
.hr-dur { color: #71717a; font-weight: 700; font-family: var(--font-numbers), monospace; }
.hr-ago { color: #71717a; font-weight: 600; margin-left: auto; }
.hr-by { color: #94a3b8; font-weight: 700; font-size: 11px; }

/* Server Map */
.smap { margin-bottom: 24px; }
.smap-title { font-size: 11px; font-weight: 800; color: #71717a; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
.smap-title span { background: #1c1c2b; color: #cbd5e1; padding: 2px 10px; border-radius: 10px; font-size: 10px; font-weight: 700; letter-spacing: .3px; text-transform: none; }
.smap-empty { color: #71717a; font-size: 12px; text-align: center; padding: 24px; background: #14141f; border: 1px dashed #262636; border-radius: 10px; }
.smap-list { display: flex; flex-direction: column; gap: 10px; }
.smap-server {
  background: #14141f; border: 1px solid #262636; border-radius: 12px; padding: 14px 16px;
}
.smap-server.active {
  border-color: #facc15;
  background: linear-gradient(135deg, rgba(250,204,21,.06), #14141f);
  box-shadow: 0 0 16px rgba(250,204,21,.15);
}
.ss-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
.ss-title { display: flex; align-items: center; gap: 10px; }
.ss-idx { font-size: 14px; font-weight: 800; color: #e8e8f0; }
.ss-badge { background: #facc15; color: #0b0b14; font-size: 9px; font-weight: 900; padding: 3px 8px; border-radius: 4px; letter-spacing: .5px; }
.ss-copy {
  background: #262636; color: #e8e8f0; border: 1px solid #3f3f46;
  font-size: 11px; font-weight: 700; padding: 6px 12px; border-radius: 6px; cursor: pointer;
  font-family: inherit; transition: all .12s;
}
.ss-copy:hover { background: #3f3f46; border-color: #52525b; }
.ss-jobid { font-size: 10px; color: #71717a; font-family: var(--font-numbers), monospace; margin-bottom: 10px; word-break: break-all; }
.ss-accs { display: flex; flex-direction: column; gap: 4px; padding-top: 8px; border-top: 1px solid #262636; }
.ss-acc { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 4px 0; }
.ss-acc-name { font-weight: 800; color: #e8e8f0; min-width: 120px; }
.ss-arrow { color: #52525b; font-weight: 700; }
.ss-acc-dev { color: #a78bfa; font-weight: 700; font-family: var(--font-numbers), monospace; }
`;
