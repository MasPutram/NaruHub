"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface Pet {
  category: string;
  name?: string;
  rate: number;
  mutations?: string[];
}

interface Account {
  sourceAccount: string;
  money: number | null;
  speed: number | null;
  incomeAktif: number | null;
  incomePotensi: number | null;
  highValuePetTotal: number | null;
  kandangLevel: number | null;
  treadmillLevel: number | null;
  petsCount: number;
  stolenCount: number;
  mutationToken?: number | null;
  scrambleToken?: number | null;
  growingEggCount?: number;
  backpackEggCount?: number;
  topPets: Pet[];
  online: boolean;
  moderated?: boolean;
  resolved?: boolean;
  moderatedAt?: number;
  resolvedAt?: number;
  detail?: {
    activePets?: Pet[];
    activeLimit?: number;
    allPets?: Pet[];
    growingEggs?: Pet[];
    backpackEggs?: Pet[];
  };
}

/* ===== Icon helpers ===== */
let iconIndex: Record<string, string> | null = null;
let iconIndexPromise: Promise<Record<string, string>> | null = null;
function loadIconIndex(): Promise<Record<string, string>> {
  if (iconIndex) return Promise.resolve(iconIndex);
  if (!iconIndexPromise) {
    iconIndexPromise = fetch("/icons/index.json")
      .then((r) => r.json())
      .then((data) => { iconIndex = data; return data; })
      .catch(() => { iconIndex = {}; return {}; });
  }
  return iconIndexPromise;
}
function petIconUrl(category: string, index: Record<string, string>): string | null {
  const filename = index[category];
  if (filename) return `/icons/normal/${encodeURIComponent(filename)}`;
  return null;
}
function petRarity(category: string, index: Record<string, string>): string | null {
  const filename = index[category];
  if (!filename) return null;
  const m = filename.match(/\[([^\]]+)\]/);
  return m ? m[1] : null;
}
function rarityColor(rarity: string | null): string {
  switch (rarity) {
    case "Divine": return "#e879f9";
    case "Eternal": return "#f97316";
    case "Secret": return "#ef4444";
    case "Cosmic": return "#22d3ee";
    case "Mythic": return "#a78bfa";
    case "Legendary": return "#fbbf24";
    case "Epic": return "#818cf8";
    case "Rare": return "#34d399";
    case "Uncommon": return "#94a3b8";
    default: return "var(--dim)";
  }
}
const DIVINE_RARITIES = new Set(["Divine", "Eternal"]);
const ONE_BILLION = 1_000_000_000;
function pickHighlightPet(pets: Pet[], index: Record<string, string>): { highlight: Pet | null; main: Pet[] } {
  if (!pets || pets.length === 0) return { highlight: null, main: [] };
  const divineHighRate = pets
    .filter((p) => DIVINE_RARITIES.has(petRarity(p.category, index) || "") && (p.rate || 0) >= ONE_BILLION)
    .sort((a, b) => (b.rate || 0) - (a.rate || 0));
  let highlight: Pet;
  if (divineHighRate.length > 0) highlight = divineHighRate[0];
  else highlight = [...pets].sort((a, b) => (b.rate || 0) - (a.rate || 0))[0];
  const main = pets.filter((p) => p !== highlight).slice(0, 3);
  return { highlight, main };
}

function PetIcon({ category, name, size = 32 }: { category: string; name: string; size?: number }) {
  const [index, setIndex] = useState<Record<string, string>>({});
  useEffect(() => { loadIconIndex().then(setIndex); }, []);
  const staticSrc = petIconUrl(category, index);
  const fallbackSrc = `/api/pet-icon?category=${encodeURIComponent(category)}`;
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setSrc(staticSrc); setFailed(false); }, [staticSrc]);
  if (!src || failed) {
    if (!staticSrc && !failed && category) {
      return <img src={fallbackSrc} alt={name} width={size} height={size} style={{ borderRadius: 6, objectFit: "contain", background: "#1c1c2b", flexShrink: 0 }} onError={() => setFailed(true)} />;
    }
    return <div style={{ width: size, height: size, borderRadius: 6, background: "#262640", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.35, color: "var(--dim)", flexShrink: 0 }}>{(name || "?")[0]}</div>;
  }
  return <img src={src} alt={name} width={size} height={size} style={{ borderRadius: 6, objectFit: "contain", background: "#1c1c2b", flexShrink: 0 }} onError={() => { if (staticSrc && !failed) setSrc(fallbackSrc); else setFailed(true); }} />;
}

function PetCards({ pets }: { pets: Pet[] }) {
  const [index, setIndex] = useState<Record<string, string>>({});
  useEffect(() => { loadIconIndex().then(setIndex); }, []);
  if (!pets || pets.length === 0) return null;
  const { highlight, main } = pickHighlightPet(pets, index);
  const hlRarity = highlight ? petRarity(highlight.category, index) : null;
  const hlColor = rarityColor(hlRarity);
  return (
    <div className="pet-section">
      {highlight && (
        <div className="highlight-card" style={{ borderColor: hlColor + "44" }}>
          <span className="highlight-badge" style={{ background: hlColor + "22", color: hlColor }}>{hlRarity || "TOP"}</span>
          <PetIcon category={highlight.category} name={highlight.name || highlight.category} size={36} />
          <div className="pname">{highlight.name || highlight.category}</div>
          <div className="prate" style={{ color: hlColor }}>{fmtRate(highlight.rate)}</div>
        </div>
      )}
      <div className="toppets">
        {main.map((p, i) => (
          <div key={i} className="mpet">
            <PetIcon category={p.category} name={p.name || p.category} size={28} />
            <div className="pname">{p.name || p.category}</div>
            <div className="prate">{fmtRate(p.rate)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===== Formatting ===== */
function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "-";
  const n = Number(v);
  const abs = Math.abs(n);
  if (abs >= 1e18) return "$" + (n / 1e18).toFixed(1) + "Qi";
  if (abs >= 1e15) return "$" + (n / 1e15).toFixed(1) + "Qa";
  if (abs >= 1e12) return "$" + (n / 1e12).toFixed(1) + "T";
  if (abs >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

function fmtRate(v: number | null | undefined): string {
  if (v == null) return "-";
  return fmtMoney(v) + "/s";
}

function fmtCompactNum(v: number | null | undefined): string {
  if (v == null) return "-";
  const n = Number(v);
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(1) + "T+";
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "B+";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M+";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K+";
  return n.toLocaleString("en-US");
}

function fmtNum(v: number | null | undefined): string {
  if (v == null) return "-";
  return Number(v).toLocaleString("en-US");
}

function fmtLevel(v: number | null | undefined): string {
  if (v == null || v === 0) return "-";
  return "Lv. " + v;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function accountNumber(name: string): number | null {
  const m = name.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function deviceLabel(name: string): string | null {
  const num = accountNumber(name);
  if (num === null || isNaN(num)) return null;
  const start = Math.floor((num - 1) / 10) * 10 + 1;
  return "SAE " + start;
}

type TabMode = "moderated" | "resolved";

export default function ModeratedPageWrapper() {
  return <Suspense><ModeratedPageInner /></Suspense>;
}

function ModeratedPageInner() {
  const searchParams = useSearchParams();
  const [moderatedAccounts, setModeratedAccounts] = useState<Account[]>([]);
  const [resolvedAccounts, setResolvedAccounts] = useState<Account[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [tabMode, setTabMode] = useState<TabMode>(
    searchParams.get("tab") === "resolved" ? "resolved" : "moderated"
  );
  const [actionMsg, setActionMsg] = useState<Record<string, string>>({});
  const [detailAccount, setDetailAccount] = useState<Account | null>(null);

  const fetchModerated = useCallback(async () => {
    try {
      const res = await fetch("/api/moderated-accounts");
      const data = await res.json();
      setModeratedAccounts(data.accounts || []);
    } catch {}
  }, []);

  const fetchResolved = useCallback(async () => {
    try {
      const res = await fetch("/api/resolved-moderated-accounts");
      const data = await res.json();
      setResolvedAccounts(data.accounts || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchModerated();
    fetchResolved();
    const id = setInterval(() => {
      fetchModerated();
      fetchResolved();
    }, 10000);
    return () => clearInterval(id);
  }, [fetchModerated, fetchResolved]);

  async function resolveAccount(account: string) {
    setActionMsg((prev) => ({ ...prev, [account]: "Memproses..." }));
    try {
      const res = await fetch("/api/resolve-moderated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        setModeratedAccounts((prev) => prev.filter((a) => a.sourceAccount !== account));
        fetchResolved();
        setActionMsg((prev) => ({ ...prev, [account]: "" }));
      } else {
        setActionMsg((prev) => ({ ...prev, [account]: "Gagal: " + (body.error || "unknown") }));
      }
    } catch (e: any) {
      setActionMsg((prev) => ({ ...prev, [account]: "Gagal: " + e.message }));
    }
  }

  function filtered(): Account[] {
    const list = tabMode === "moderated" ? [...moderatedAccounts] : [...resolvedAccounts];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return list.filter((a) => a.sourceAccount.toLowerCase().includes(q));
    }
    return list;
  }

  const visible = filtered();

  return (
    <div>
      <style>{`
        :root {
          --bg: #0b0b12; --card: #14141f; --card-border: #262636;
          --ink: #e8e8f0; --dim: #8b8ba3; --accent: #a78bfa; --accent2: #22d3ee;
          --green: #34d399; --gold: #fbbf24; --red: #f87171;
          --warn: #f59e0b; --surface: #1a1a2e;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); color: var(--ink); font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }

        .topbar {
          background: var(--card); border-bottom: 1px solid var(--card-border);
          padding: 16px 28px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
          position: sticky; top: 0; z-index: 50;
        }
        .topbar h1 { font-size: 20px; color: var(--ink); }

        .tab-bar { display: flex; gap: 0; padding: 0 28px; margin-top: 12px; }
        .tab-btn {
          background: var(--card); color: var(--dim); border: 1px solid var(--card-border);
          border-bottom: none; border-radius: 10px 10px 0 0;
          padding: 10px 24px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all .15s;
        }
        .tab-btn.active { background: var(--bg); color: var(--ink); border-color: var(--warn); border-bottom: 1px solid var(--bg); }
        .tab-btn .tab-badge {
          display: inline-block; background: var(--warn); color: #1a1030;
          font-size: 10px; font-weight: 800; border-radius: 8px; padding: 1px 7px; margin-left: 8px;
        }
        .tab-btn.resolved-tab.active { border-color: var(--green); }
        .tab-btn.resolved-tab .tab-badge { background: var(--green); }

        .controls { display: flex; gap: 10px; align-items: center; padding: 16px 28px; flex-wrap: wrap; }
        .controls label { color: var(--dim); font-size: 12px; font-weight: 700; }
        .controls input {
          background: var(--card); color: var(--ink); border: 1px solid var(--card-border);
          border-radius: 8px; padding: 6px 12px; font-size: 13px;
        }
        .controls input:focus { outline: none; border-color: var(--warn); }

        .summary { display: flex; gap: 12px; padding: 16px 28px; flex-wrap: wrap; }
        .scard {
          background: var(--card); border: 1px solid var(--card-border); border-radius: 12px;
          padding: 14px 20px; min-width: 150px; flex: 1;
        }
        .slabel { font-size: 10px; font-weight: 700; color: var(--dim); letter-spacing: 1px; }
        .sval { font-size: 22px; font-weight: 900; margin-top: 4px; }

        .mod-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px; padding: 16px 28px 60px;
        }

        /* ===== Card styles matching dashboard ===== */
        .card { background: var(--card); border: 1px solid var(--card-border); border-radius: 14px; padding: 16px; cursor: pointer; transition: all .15s; position: relative; }
        .card:hover { border-color: var(--warn); transform: translateY(-1px); box-shadow: 0 4px 20px rgba(0,0,0,.3); }
        .card.resolved-card:hover { border-color: var(--green); }
        .card-top { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .acc-name { font-weight: 800; font-size: 14px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dev-tag { color: var(--accent2); font-size: 9px; font-weight: 800; background: rgba(34,211,238,.08); border: 1px solid rgba(34,211,238,.2); border-radius: 5px; padding: 2px 6px; flex-shrink: 0; }
        .mod-badge { font-size: 10px; font-weight: 800; padding: 3px 10px; border-radius: 6px; flex-shrink: 0; }
        .mod-badge.warn { background: rgba(245,158,11,0.15); color: var(--warn); }
        .mod-badge.ok { background: rgba(52,211,153,0.15); color: var(--green); }
        .mod-date { font-size: 11px; color: var(--dim); margin-bottom: 10px; }

        .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 12px; margin-bottom: 10px; }
        .st .sl { font-size: 9px; font-weight: 800; color: var(--dim); letter-spacing: .3px; text-transform: uppercase; }
        .st .sv { font-size: 14px; font-weight: 800; }
        .st.speed .sv { color: var(--accent); }
        .st.money .sv { color: var(--gold); }
        .st.income .sv { color: var(--accent2); }
        .st.boss { background: linear-gradient(135deg, #7c3aed, #a78bfa); border-radius: 8px; padding: 5px 10px; }
        .st.boss .sl { color: #fff; }
        .st.boss .sv { color: #fff; font-size: 18px; }
        .st.scramble { background: linear-gradient(135deg, #059669, #34d399); border-radius: 8px; padding: 5px 10px; }
        .st.scramble .sl { color: #fff; }
        .st.scramble .sv { color: #fff; font-size: 18px; }
        .max-tag { font-size: 9px; font-weight: 900; color: #1a1030; background: linear-gradient(135deg, var(--gold), #f59e0b); padding: 1px 6px; border-radius: 4px; letter-spacing: .5px; vertical-align: middle; margin-left: 4px; display: inline-block; line-height: 1.4; }

        .egg-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding: 6px 10px; background: rgba(52,211,153,.06); border: 1px solid rgba(52,211,153,.15); border-radius: 8px; }
        .egg-bar-info { flex: 1; }
        .egg-bar-label { font-size: 9px; font-weight: 800; color: var(--green); letter-spacing: .3px; text-transform: uppercase; }
        .egg-bar-track { height: 4px; background: rgba(52,211,153,.15); border-radius: 2px; margin-top: 3px; overflow: hidden; }
        .egg-bar-fill { height: 100%; background: var(--green); border-radius: 2px; transition: width .3s; }
        .egg-bar-count { font-size: 13px; font-weight: 900; color: var(--green); }

        .pet-section { display: flex; gap: 6px; margin-bottom: 10px; }
        .highlight-card { background: linear-gradient(135deg, #1a1030 0%, #14141f 100%); border: 1px solid #a78bfa44; border-radius: 10px; padding: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 80px; text-align: center; gap: 3px; position: relative; overflow: hidden; }
        .highlight-card::before { content: ""; position: absolute; inset: 0; border-radius: 10px; background: radial-gradient(ellipse at 50% 0%, rgba(167,139,250,.12) 0%, transparent 70%); pointer-events: none; }
        .highlight-badge { font-size: 7px; font-weight: 800; letter-spacing: .5px; padding: 1px 5px; border-radius: 3px; text-transform: uppercase; }
        .highlight-card .pname { font-size: 9px; color: var(--ink); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 72px; }
        .highlight-card .prate { font-size: 10px; font-weight: 800; }
        .toppets { display: flex; gap: 5px; overflow-x: auto; flex: 1; }
        .mpet { background: #1a1a2e; border: 1px solid var(--card-border); border-radius: 7px; padding: 5px 6px; text-align: center; min-width: 64px; display: flex; flex-direction: column; align-items: center; gap: 3px; flex: 1; }
        .mpet .pname { font-size: 8px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 56px; }
        .mpet .prate { font-size: 9px; color: var(--gold); font-weight: 700; }

        .card-actions { display: flex; gap: 6px; margin-top: 10px; }
        .act-btn { flex: 1; border: none; border-radius: 8px; padding: 7px 8px; font-size: 11px; font-weight: 800; cursor: pointer; text-align: center; text-decoration: none; display: block; }
        .act-btn:hover { filter: brightness(1.15); }
        .act-poster { background: var(--accent); color: #1a1030; }
        .act-resolve { background: var(--green); color: #052e10; }

        .genmsg { font-size: 10px; margin-top: 4px; min-height: 12px; color: var(--red); }

        /* Resolved watermark */
        .resolved-overlay {
          position: absolute; inset: 0; z-index: 2; pointer-events: none;
          display: flex; align-items: center; justify-content: center;
        }
        .resolved-watermark span {
          font-size: 32px; font-weight: 900; color: rgba(52, 211, 153, 0.15);
          letter-spacing: 6px; transform: rotate(-15deg);
        }

        /* Detail modal */
        .modal-overlay { position: fixed; inset: 0; background: #000a; z-index: 50; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .modal { background: var(--card); border: 1px solid var(--card-border); border-radius: 14px; padding: 24px; max-width: 640px; width: 100%; max-height: 90vh; overflow-y: auto; }
        .modal h2 { margin: 0 0 4px; font-size: 18px; }
        .modal .msub { color: var(--dim); font-size: 12px; margin-bottom: 16px; }
        .detail-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--card-border); border-radius: 10px; overflow: hidden; margin-bottom: 16px; }
        .detail-stat { background: var(--card); padding: 10px 12px; text-align: center; }
        .detail-stat .dsl { font-size: 9px; font-weight: 700; color: var(--dim); letter-spacing: .5px; }
        .detail-stat .dsv { font-size: 15px; font-weight: 800; margin-top: 2px; }
        .detail-pets-label { font-size: 10px; font-weight: 800; color: var(--dim); letter-spacing: .5px; margin-bottom: 8px; }
        .detail-pets { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
        .detail-pet { background: #1a1a2e; border: 1px solid var(--card-border); border-radius: 8px; padding: 6px 10px; display: flex; align-items: center; gap: 8px; }
        .detail-pet .dpname { font-size: 12px; font-weight: 700; }
        .detail-pet .dprate { font-size: 11px; color: var(--accent2); font-weight: 700; }
        .detail-pet .dpmut { font-size: 9px; font-weight: 800; }
        .modal .close-btn { border: 1px solid var(--card-border); background: transparent; color: var(--dim); padding: 8px 16px; border-radius: 8px; font-size: 13px; cursor: pointer; }
        .modal .close-btn:hover { color: var(--ink); border-color: #44445a; }

        .empty { color: var(--dim); text-align: center; padding: 60px 28px; font-size: 14px; }
      `}</style>

      <div className="topbar">
        <h1>Captcha / Moderated</h1>
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>
          {tabMode === "moderated"
            ? `${moderatedAccounts.length} akun moderated`
            : `${resolvedAccounts.length} akun resolved`}
        </span>
      </div>

      <div className="tab-bar">
        <button className={`tab-btn ${tabMode === "moderated" ? "active" : ""}`} onClick={() => setTabMode("moderated")}>
          Moderated <span className="tab-badge">{moderatedAccounts.length}</span>
        </button>
        <button className={`tab-btn resolved-tab ${tabMode === "resolved" ? "active" : ""}`} onClick={() => setTabMode("resolved")}>
          Resolved <span className="tab-badge">{resolvedAccounts.length}</span>
        </button>
      </div>

      <div className="controls">
        <label>Cari:</label>
        <input type="text" placeholder="Nama akun..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: 200 }} />
      </div>

      <div className="summary">
        <div className="scard">
          <div className="slabel">{tabMode === "moderated" ? "AKUN MODERATED" : "AKUN RESOLVED"}</div>
          <div className="sval" style={{ color: tabMode === "moderated" ? "var(--warn)" : "var(--green)" }}>{visible.length}</div>
        </div>
        <div className="scard">
          <div className="slabel">TOTAL SPEED</div>
          <div className="sval" style={{ color: "var(--accent)" }}>{fmtCompactNum(visible.reduce((s, a) => s + (Number(a.speed) || 0), 0))}</div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          {tabMode === "moderated"
            ? moderatedAccounts.length > 0 ? "Ga ada akun yang cocok dengan pencarian." : "Belum ada akun yang di-moderated."
            : resolvedAccounts.length > 0 ? "Ga ada akun resolved yang cocok dengan pencarian." : "Belum ada akun yang resolved."}
        </div>
      ) : (
        <div className="mod-grid">
          {visible.map((a) => {
            const eggCount = (a.growingEggCount || 0);
            const eggPct = Math.min(100, Math.round((eggCount / 20) * 100));
            return (
              <div key={a.sourceAccount} className={`card ${a.resolved ? "resolved-card" : ""}`} onClick={() => setDetailAccount(a)}>
                {a.resolved && (
                  <div className="resolved-overlay">
                    <div className="resolved-watermark"><span>RESOLVED</span></div>
                  </div>
                )}

                <div className="card-top">
                  <span className="acc-name">{a.sourceAccount}</span>
                  {deviceLabel(a.sourceAccount) && <span className="dev-tag">{deviceLabel(a.sourceAccount)}</span>}
                  <span className={`mod-badge ${a.resolved ? "ok" : "warn"}`}>{a.resolved ? "RESOLVED" : "CAPTCHA"}</span>
                </div>

                <div className="mod-date">
                  {a.resolved && a.resolvedAt ? `Resolved: ${fmtDate(a.resolvedAt)}` : a.moderatedAt ? `Moderated: ${fmtDate(a.moderatedAt)}` : ""}
                </div>

                <div className="stats">
                  <div className="st speed"><div className="sl">SPEED</div><div className="sv">{fmtCompactNum(a.speed)}</div></div>
                  <div className="st money"><div className="sl">CASH</div><div className="sv">{fmtMoney(a.money)}</div></div>
                  <div className="st income"><div className="sl">INCOME AKTIF</div><div className="sv">{fmtRate(a.incomeAktif)}</div></div>
                  <div className="st income"><div className="sl">INCOME POTENSI</div><div className="sv">{fmtRate(a.incomePotensi)}</div></div>
                  <div className="st"><div className="sl">PEN &amp; TM</div><div className="sv">{fmtLevel(a.kandangLevel)} &amp; {fmtLevel(a.treadmillLevel)}</div></div>
                  <div className="st"><div className="sl">TOTAL EGG</div><div className="sv">{fmtNum((a.growingEggCount || 0) + (a.backpackEggCount || 0))}</div></div>
                  <div className="st boss"><div className="sl">&#x1F9EC; TOKEN MUTASI</div><div className="sv">{fmtNum(a.mutationToken ?? 0)}</div></div>
                  <div className="st scramble"><div className="sl">&#x1F500; TOKEN SCRAMBLE</div><div className="sv">{a.scrambleToken != null ? fmtNum(a.scrambleToken) : "—"}</div></div>
                </div>

                {eggCount > 0 && (
                  <div className="egg-bar">
                    <span style={{ fontSize: 14 }}>&#x1F95A;</span>
                    <div className="egg-bar-info">
                      <div className="egg-bar-label">GROWING EGGS</div>
                      <div className="egg-bar-track"><div className="egg-bar-fill" style={{ width: eggPct + "%" }} /></div>
                    </div>
                    <span className="egg-bar-count">{eggCount}</span>
                  </div>
                )}

                <PetCards pets={a.topPets || []} />

                <div className="card-actions" style={{ position: "relative", zIndex: 15 }}>
                  <a className="act-btn act-poster" href={`/poster?account=${encodeURIComponent(a.sourceAccount)}`} onClick={(e) => e.stopPropagation()}>Poster</a>
                  {!a.resolved && (
                    <button className="act-btn act-resolve" onClick={(e) => { e.stopPropagation(); resolveAccount(a.sourceAccount); }}>Resolved</button>
                  )}
                </div>
                {actionMsg[a.sourceAccount] && <div className="genmsg">{actionMsg[a.sourceAccount]}</div>}
              </div>
            );
          })}
        </div>
      )}

      {detailAccount && (
        <div className="modal-overlay" onClick={() => setDetailAccount(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{detailAccount.sourceAccount}</h2>
            <div className="msub">
              {detailAccount.resolved && detailAccount.resolvedAt ? `Resolved: ${fmtDate(detailAccount.resolvedAt)}` : detailAccount.moderatedAt ? `Moderated: ${fmtDate(detailAccount.moderatedAt)}` : ""}
              {deviceLabel(detailAccount.sourceAccount) && ` · ${deviceLabel(detailAccount.sourceAccount)}`}
            </div>

            <div className="detail-stats">
              <div className="detail-stat"><div className="dsl">SPEED</div><div className="dsv" style={{ color: "var(--accent)" }}>{fmtCompactNum(detailAccount.speed)}</div></div>
              <div className="detail-stat"><div className="dsl">CASH</div><div className="dsv" style={{ color: "var(--gold)" }}>{fmtMoney(detailAccount.money)}</div></div>
              <div className="detail-stat"><div className="dsl">INCOME AKTIF</div><div className="dsv" style={{ color: "var(--accent2)" }}>{fmtRate(detailAccount.incomeAktif)}</div></div>
              <div className="detail-stat"><div className="dsl">INCOME POTENSI</div><div className="dsv" style={{ color: "var(--accent2)" }}>{fmtRate(detailAccount.incomePotensi)}</div></div>
              <div className="detail-stat"><div className="dsl">PEN &amp; TM</div><div className="dsv">{fmtLevel(detailAccount.kandangLevel)} &amp; {fmtLevel(detailAccount.treadmillLevel)}</div></div>
              <div className="detail-stat"><div className="dsl">TOTAL EGG</div><div className="dsv">{fmtNum((detailAccount.growingEggCount || 0) + (detailAccount.backpackEggCount || 0))}</div></div>
              <div className="detail-stat"><div className="dsl">TOKEN MUTASI</div><div className="dsv" style={{ color: "var(--accent)" }}>{fmtNum(detailAccount.mutationToken ?? 0)}</div></div>
              <div className="detail-stat"><div className="dsl">TOKEN SCRAMBLE</div><div className="dsv" style={{ color: "var(--green)" }}>{detailAccount.scrambleToken != null ? fmtNum(detailAccount.scrambleToken) : "—"}</div></div>
              <div className="detail-stat"><div className="dsl">STOLEN</div><div className="dsv">{fmtNum(detailAccount.stolenCount)}</div></div>
            </div>

            {(detailAccount.topPets || []).length > 0 && (
              <>
                <div className="detail-pets-label">TOP PETS</div>
                <div className="detail-pets">
                  {detailAccount.topPets.map((p, i) => (
                    <div key={i} className="detail-pet">
                      <PetIcon category={p.category} name={p.name || p.category} size={32} />
                      <div>
                        <div className="dpname">{p.name || p.category}</div>
                        <div className="dprate">{fmtRate(p.rate)}</div>
                        {p.mutations && p.mutations.length > 0 && (
                          <div className="dpmut" style={{ color: "var(--accent)" }}>{p.mutations.map((m) => m.toUpperCase()).join("+")}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="close-btn" onClick={() => setDetailAccount(null)}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
