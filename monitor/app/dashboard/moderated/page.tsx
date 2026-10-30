"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface Pet {
  category: string;
  name?: string;
  rate: number;
  mutations?: string[];
  weight?: number;
  ready?: boolean;
  remainingSeconds?: number;
  rarity?: string;
  uid?: string;
  _equipped?: boolean;
  _bag?: boolean;
}

interface StolenItem {
  category?: string;
  name?: string;
  rate?: number;
  weight?: number;
  mutations?: string[];
  fromAccount?: string;
  stolenAt?: number;
}

interface ToolItem {
  category?: string;
  name?: string;
  count?: number;
  itemType?: string;
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
  bossToken?: number | null;
  mutationToken?: number | null;
  scrambleToken?: number | null;
  nitroToken?: number | null;
  spectralToken?: number | null;
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
    stolenItems?: StolenItem[];
    tools?: ToolItem[];
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

function fmtEggTimer(sec?: number): string {
  if (sec == null || sec <= 0) return "Siap!";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}j ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(sec)}s`;
}

function mutationClass(name: string): string {
  const k = String(name || "").trim().toLowerCase();
  if (!k) return "pg-mutation mut-default";
  if (/^gold/.test(k)) return "pg-mutation mut-golden";
  if (/^silver/.test(k)) return "pg-mutation mut-silver";
  if (/^rainbow/.test(k)) return "pg-mutation mut-rainbow";
  if (/^fract/.test(k) || k === "boss fractured") return "pg-mutation mut-fractured";
  if (/^boss/.test(k)) return "pg-mutation mut-boss";
  if (/^nitro/.test(k)) return "pg-mutation mut-nitro";
  if (/^sakura/.test(k)) return "pg-mutation mut-sakura";
  if (/^froz/.test(k) || k === "ice") return "pg-mutation mut-frozen";
  if (/^magma/.test(k) || k === "lava") return "pg-mutation mut-magma";
  if (/^candy/.test(k)) return "pg-mutation mut-candy";
  if (/^shock/.test(k)) return "pg-mutation mut-shocked";
  if (/^scare/.test(k)) return "pg-mutation mut-scared";
  if (/^alpha/.test(k)) return "pg-mutation mut-alpha";
  if (k === "2x" || /^double/.test(k)) return "pg-mutation mut-2x";
  if (/^spectral/.test(k)) return "pg-mutation mut-spectral";
  if (/^enchant/.test(k)) return "pg-mutation mut-enchanted";
  if (/^scrambl/.test(k)) return "pg-mutation mut-scrambled";
  if (/^greatbloom/.test(k) || k === "spirit bloom") return "pg-mutation mut-spiritbloom";
  if (/^monstrous/.test(k) || k === "parasite") return "pg-mutation mut-parasite";
  return "pg-mutation mut-default";
}
function mutationLabel(name: string): string {
  const k = String(name || "").trim().toLowerCase();
  if (/^greatbloom/.test(k)) return "Spirit Bloom";
  if (/^monstrous/.test(k)) return "Parasite";
  return name;
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
type DetailTab = "pets" | "eggs" | "stolen" | "tools";
const RARITY_ORDER = ["Eternal", "Divine", "Secret", "Cosmic", "Mythic", "Legendary", "Epic", "Rare", "Uncommon", "Common"];

function PetGrid({ pets, idx, showBadges = false }: { pets: Pet[]; idx: Record<string, string>; showBadges?: boolean }) {
  const sorted = [...(pets || [])].sort((a, b) => (b.rate || 0) - (a.rate || 0));
  if (sorted.length === 0) return <div className="detail-empty">Kosong.</div>;
  return (
    <div className="pet-grid">
      {sorted.map((p, i) => {
        const rar = petRarity(p.category, idx);
        const rc = rarityColor(rar);
        return (
          <div key={i} className="pg-card">
            {showBadges && (rar || p._equipped || p._bag) && (
              <div className="pg-badges">
                {rar && <span className="pg-badge-rarity" style={{ background: rc + "22", color: rc, border: `1px solid ${rc}66` }}>{rar.toUpperCase()}</span>}
                {p._equipped && <span className="pg-badge-role equipped">EQUIPPED</span>}
                {p._bag && !p._equipped && <span className="pg-badge-role bag">BAG</span>}
              </div>
            )}
            <PetIcon category={p.category} name={p.name || p.category} size={36} />
            <div className="pg-info">
              <div className="pg-name">{p.name || p.category}</div>
              <div className="pg-meta">
                <span className="pg-rate">{fmtRate(p.rate)}</span>
                {!showBadges && rar && <span className="pg-rarity" style={{ background: rc + "18", color: rc, border: `1px solid ${rc}33` }}>{rar}</span>}
                {p.weight != null && <span className="pg-weight-inline">{Number(p.weight).toLocaleString()} Kg</span>}
                {(Array.isArray(p.mutations) ? p.mutations : []).map((m, j) => <span key={j} className={mutationClass(m)}>{mutationLabel(m)}</span>)}
              </div>
              {showBadges && p.uid && <div className="pg-uid">UID: {String(p.uid).slice(0, 8)}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GrowingEggGrid({ eggs, idx }: { eggs: Pet[]; idx: Record<string, string> }) {
  if (!eggs || eggs.length === 0) return <div className="detail-empty">Tidak ada telur yang sedang tumbuh.</div>;
  const sorted = [...eggs].sort((a, b) => (a.remainingSeconds ?? 9999999) - (b.remainingSeconds ?? 9999999));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
      {sorted.map((egg, i) => {
        const isReady = egg.ready || (egg.remainingSeconds != null && egg.remainingSeconds <= 0);
        const remaining = egg.remainingSeconds ?? 0;
        const totalTime = 8 * 3600;
        const elapsed = totalTime - remaining;
        const pct = isReady ? 100 : Math.min(100, Math.max(0, Math.round((elapsed / totalTime) * 100)));
        const rar = petRarity(egg.category, idx);
        const rc = rarityColor(rar);
        const circumference = 2 * Math.PI * 17;
        const strokeDashoffset = circumference - (pct / 100) * circumference;
        const ringColor = isReady ? "var(--gold)" : "var(--green)";
        return (
          <div key={i} className={`egg-card ${isReady ? "ready" : ""}`}>
            <div className="egg-timer-ring">
              <svg width="44" height="44" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="17" fill="none" stroke="var(--card-border)" strokeWidth="3" />
                <circle cx="22" cy="22" r="17" fill="none" stroke={ringColor} strokeWidth="3" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} style={{ transition: "stroke-dashoffset .5s" }} />
              </svg>
              <span className="etr-text" style={{ color: ringColor }}>{pct}%</span>
            </div>
            <PetIcon category={egg.category} name={egg.name || egg.category} size={36} />
            <div className="egg-info">
              <div className="egg-name">{egg.name || egg.category}</div>
              <div className="egg-sub">
                <span className="egg-rate">{fmtRate(egg.rate)}</span>
                {rar && <span className="pg-rarity" style={{ background: rc + "18", color: rc, border: `1px solid ${rc}33` }}>{rar}</span>}
                {(Array.isArray(egg.mutations) ? egg.mutations : []).map((m, j) => <span key={j} className={mutationClass(m)}>{mutationLabel(m)}</span>)}
              </div>
              <div style={{ marginTop: 3, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {isReady ? (
                  <span className="egg-ready-badge">SIAP MENETAS</span>
                ) : (
                  <span className="egg-time-label" style={{ color: "var(--green)" }}>{fmtEggTimer(remaining)} tersisa</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
  const [detailTab, setDetailTab] = useState<DetailTab>("pets");
  const [rarityFilter, setRarityFilter] = useState<string>("ALL");
  const [iconIdx, setIconIdx] = useState<Record<string, string>>({});
  useEffect(() => { loadIconIndex().then(setIconIdx); }, []);

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
        .dev-tag { color: var(--accent2); font-size: 13px; font-weight: 700; flex-shrink: 0; }
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
        .st.nitro { background: linear-gradient(135deg, #d97706, #fbbf24); border-radius: 8px; padding: 5px 10px; }
        .st.nitro .sl { color: #fff; }
        .st.nitro .sv { color: #fff; font-size: 18px; }
        .st.spectral { background: linear-gradient(135deg, #4f46e5, #818cf8); border-radius: 8px; padding: 5px 10px; }
        .st.spectral .sl { color: #fff; }
        .st.spectral .sv { color: #fff; font-size: 18px; }
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

        /* Detail modal — matches dashboard */
        .modal-overlay { position: fixed; inset: 0; background: #000a; z-index: 50; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .modal { background: var(--card); border: 1px solid var(--card-border); border-radius: 14px; max-width: 960px; width: 100%; max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column; }
        .modal-header { display: flex; align-items: center; gap: 12px; padding: 16px 24px; border-bottom: 1px solid var(--card-border); }
        .mh-name { font-size: 18px; font-weight: 900; flex: 1; }
        .modal-close { background: transparent; border: 1px solid var(--card-border); color: var(--dim); width: 32px; height: 32px; border-radius: 8px; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .modal-close:hover { color: var(--ink); border-color: #44445a; }

        .modal-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; padding: 16px 24px; background: var(--card); border-bottom: 1px solid var(--card-border); }
        .ms-card { background: var(--surface); border: 1px solid var(--card-border); border-radius: 10px; padding: 10px 12px; }
        .ms-card .mslabel { font-size: 9px; font-weight: 800; color: var(--dim); letter-spacing: .5px; text-transform: uppercase; margin-bottom: 4px; }
        .ms-card .msval { font-size: 16px; font-weight: 900; }

        .modal-tabs { display: flex; gap: 0; padding: 0 24px; background: var(--card); border-bottom: 1px solid var(--card-border); }
        .mtab { padding: 12px 20px; font-size: 12px; font-weight: 800; letter-spacing: .3px; cursor: pointer; color: var(--dim); background: transparent; border: none; border-bottom: 2px solid transparent; transition: all .15s; }
        .mtab:hover { color: var(--ink); }
        .mtab.active { color: var(--accent2); border-bottom-color: var(--accent2); }

        .rarity-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 24px 0; background: var(--card); }
        .rchip { font-size: 10px; font-weight: 800; padding: 5px 10px; border-radius: 20px; background: var(--surface); color: var(--dim); border: 1px solid var(--card-border); cursor: pointer; text-transform: uppercase; letter-spacing: .3px; transition: all .12s; display: inline-flex; align-items: center; gap: 5px; }
        .rchip:hover { border-color: var(--accent2); color: var(--ink); }
        .rchip.active { background: rgba(34,211,238,.15); color: var(--accent2); border-color: rgba(34,211,238,.4); }
        .rchip-count { background: rgba(255,255,255,.06); color: inherit; border-radius: 8px; padding: 0 5px; font-weight: 900; font-size: 9px; }
        .value-bar { padding: 8px 24px; font-size: 12px; font-weight: 800; color: var(--accent2); background: var(--card); border-bottom: 1px solid var(--card-border); }

        .modal-body { padding: 16px 24px 24px; }
        .detail-empty { color: var(--dim); text-align: center; padding: 40px 0; font-size: 13px; }

        .pet-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
        .pg-card { background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 14px; display: flex; align-items: flex-start; gap: 10px; transition: border-color .15s; position: relative; }
        .pg-card:hover { border-color: #333355; }
        .pg-info { flex: 1; min-width: 0; }
        .pg-name { font-size: 12px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; }
        .pg-meta { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
        .pg-rate { font-size: 11px; font-weight: 800; color: var(--accent2); }
        .pg-rarity { font-size: 8px; font-weight: 800; padding: 1px 5px; border-radius: 3px; letter-spacing: .3px; }
        .pg-weight-inline { font-size: 9px; color: var(--dim); }
        .pg-uid { font-size: 9px; color: var(--dim); margin-top: 3px; }
        .pg-badges { position: absolute; top: 8px; right: 8px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; z-index: 1; pointer-events: none; }
        .pg-badge-rarity { font-size: 8px; font-weight: 900; padding: 3px 7px; border-radius: 5px; letter-spacing: .4px; text-transform: uppercase; }
        .pg-badge-role { font-size: 8px; font-weight: 900; padding: 2px 6px; border-radius: 4px; letter-spacing: .3px; }
        .pg-badge-role.equipped { background: rgba(34,211,238,.15); color: var(--accent2); border: 1px solid rgba(34,211,238,.4); }
        .pg-badge-role.bag { background: rgba(251,191,36,.12); color: var(--gold); border: 1px solid rgba(251,191,36,.3); }

        .pg-mutation { font-size: 8px; font-weight: 800; border-radius: 3px; padding: 1px 5px; text-transform: uppercase; letter-spacing: .3px; border: 1px solid transparent; }
        .pg-mutation.mut-golden { color: #7c4a03; background: linear-gradient(135deg, #fde68a, #f59e0b); border-color: rgba(245,158,11,.5); text-shadow: 0 1px 0 rgba(255,255,255,.35); }
        .pg-mutation.mut-silver { color: #4b5563; background: linear-gradient(135deg, #f3f4f6, #cbd5e1); border-color: rgba(148,163,184,.5); text-shadow: 0 1px 0 rgba(255,255,255,.35); }
        .pg-mutation.mut-rainbow { color: #fff; background: linear-gradient(90deg, #ef4444, #f59e0b, #22d3ee, #22c55e, #a855f7); border-color: rgba(255,255,255,.2); text-shadow: 0 1px 2px rgba(0,0,0,.4); }
        .pg-mutation.mut-fractured { color: #fff; background: linear-gradient(135deg, #1a1030, #6d28d9); border-color: rgba(139,92,246,.5); text-shadow: 0 1px 2px rgba(0,0,0,.4); }
        .pg-mutation.mut-boss { color: #fff; background: linear-gradient(135deg, #7f1d1d, #b91c1c); border-color: rgba(239,68,68,.4); }
        .pg-mutation.mut-nitro { color: #fff; background: linear-gradient(135deg, #92400e, #d97706); border-color: rgba(217,119,6,.5); }
        .pg-mutation.mut-sakura { color: #831843; background: linear-gradient(135deg, #fbcfe8, #f472b6); border-color: rgba(244,114,182,.4); }
        .pg-mutation.mut-frozen { color: #0c4a6e; background: linear-gradient(135deg, #bae6fd, #38bdf8); border-color: rgba(56,189,248,.4); text-shadow: 0 1px 0 rgba(255,255,255,.35); }
        .pg-mutation.mut-magma { color: #fff; background: linear-gradient(135deg, #ea580c, #dc2626); border-color: rgba(220,38,38,.5); text-shadow: 0 1px 2px rgba(0,0,0,.35); }
        .pg-mutation.mut-candy { color: #831843; background: linear-gradient(135deg, #fbcfe8, #fda4af, #fde68a); border-color: rgba(251,113,133,.4); }
        .pg-mutation.mut-shocked { color: #422006; background: linear-gradient(135deg, #fef08a, #facc15); border-color: rgba(234,179,8,.5); }
        .pg-mutation.mut-scared { color: #e5e7eb; background: linear-gradient(135deg, #1f2937, #4b5563); border-color: rgba(107,114,128,.4); }
        .pg-mutation.mut-alpha { color: #fff; background: linear-gradient(135deg, #4c1d95, #7c3aed); border-color: rgba(139,92,246,.5); text-shadow: 0 1px 2px rgba(0,0,0,.4); }
        .pg-mutation.mut-2x { color: #fff; background: linear-gradient(135deg, #b45309, #f97316); border-color: rgba(249,115,22,.5); text-shadow: 0 1px 2px rgba(0,0,0,.3); }
        .pg-mutation.mut-spectral { color: #fff; background: linear-gradient(135deg, #0e7490, #06b6d4); border-color: rgba(6,182,212,.5); text-shadow: 0 1px 2px rgba(0,0,0,.3); }
        .pg-mutation.mut-enchanted { color: #fff; background: linear-gradient(135deg, #065f46, #10b981); border-color: rgba(16,185,129,.5); text-shadow: 0 1px 2px rgba(0,0,0,.3); }
        .pg-mutation.mut-scrambled { color: #fff; background: linear-gradient(135deg, #0f766e, #14b8a6); border-color: rgba(20,184,166,.5); text-shadow: 0 1px 2px rgba(0,0,0,.3); }
        .pg-mutation.mut-spiritbloom { color: #fff; background: linear-gradient(135deg, #5b21b6, #8b5cf6); border-color: rgba(139,92,246,.5); text-shadow: 0 1px 2px rgba(0,0,0,.3); }
        .pg-mutation.mut-parasite { color: #fff; background: linear-gradient(135deg, #7f1d1d, #991b1b); border-color: rgba(153,27,27,.5); text-shadow: 0 1px 2px rgba(0,0,0,.3); }
        .pg-mutation.mut-default { color: #c4b5fd; background: rgba(167,139,250,.1); border-color: rgba(167,139,250,.25); }

        .egg-card { background: var(--card); border: 1px solid rgba(52,211,153,.2); border-radius: 12px; padding: 12px; display: flex; align-items: center; gap: 12px; }
        .egg-card.ready { border-color: var(--gold); background: linear-gradient(135deg, rgba(251,191,36,.05), var(--card)); }
        .egg-timer-ring { position: relative; flex-shrink: 0; width: 44px; height: 44px; }
        .etr-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 900; }
        .egg-info { flex: 1; min-width: 0; }
        .egg-name { font-size: 13px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .egg-sub { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 2px; }
        .egg-rate { font-size: 11px; font-weight: 800; color: var(--accent2); }
        .egg-ready-badge { font-size: 9px; font-weight: 900; background: var(--gold); color: #1a1030; padding: 2px 8px; border-radius: 4px; letter-spacing: .5px; }
        .egg-time-label { font-size: 10px; font-weight: 700; }

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
                  <div className="st nitro"><div className="sl">&#x1F3CE;&#xFE0F; TOKEN NITRO</div><div className="sv">{a.nitroToken != null ? fmtNum(a.nitroToken) : "—"}</div></div>
                  <div className="st spectral"><div className="sl">&#x1F47B; TOKEN SPECTRAL</div><div className="sv">{a.spectralToken != null ? fmtNum(a.spectralToken) : "—"}</div></div>
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

      {detailAccount && (() => {
        const d = detailAccount.detail;
        const petsForTab = (): Pet[] => {
          if (!d) return [];
          if (detailTab === "pets") {
            const activeUids = new Set((d.activePets || []).map((p) => p.uid).filter(Boolean));
            const merged: Pet[] = [];
            for (const p of (d.activePets || [])) merged.push({ ...p, _equipped: true });
            for (const p of (d.allPets || [])) {
              if (p.uid && activeUids.has(p.uid)) continue;
              merged.push({ ...p, _bag: true });
            }
            return merged;
          }
          if (detailTab === "eggs") {
            const merged: Pet[] = [];
            for (const e of (d.growingEggs || [])) merged.push(e);
            for (const e of (d.backpackEggs || [])) merged.push({ ...e, _bag: true });
            return merged;
          }
          return [];
        };
        const allItems = petsForTab();
        const rarityCounts: Record<string, number> = { ALL: allItems.length };
        for (const p of allItems) {
          const r = petRarity(p.category, iconIdx) || "Unknown";
          rarityCounts[r] = (rarityCounts[r] || 0) + 1;
        }
        const rarityOptions = ["ALL", ...RARITY_ORDER.filter((r) => rarityCounts[r] > 0)];
        if (rarityCounts["Unknown"] > 0) rarityOptions.push("Unknown");
        const filteredItems = rarityFilter === "ALL" ? allItems : allItems.filter((p) => (petRarity(p.category, iconIdx) || "Unknown") === rarityFilter);
        const totalValueRate = filteredItems.reduce((s, p) => s + (Number(p.rate) || 0), 0);
        const petCount = d ? (d.activePets?.length ?? 0) + (d.allPets?.length ?? 0) - (d.activePets?.filter((p) => p.uid && (d.allPets || []).some((a) => a.uid === p.uid)).length ?? 0) : 0;
        const eggCount = d ? (d.growingEggs?.length ?? 0) + (d.backpackEggs?.length ?? 0) : 0;
        const stolenCount = d?.stolenItems?.length ?? 0;
        const toolsCount = d?.tools?.length ?? 0;
        const incomePotensi = (() => {
          if (!d) return detailAccount.incomePotensi || 0;
          const limit = d.activeLimit || 19;
          const all = [...(d.activePets || []), ...(d.allPets || []), ...(d.growingEggs || []), ...(d.backpackEggs || [])];
          const seen = new Set<string>();
          const deduped: Pet[] = [];
          for (const p of all) {
            const k = p.uid || `${p.category}|${(p.mutations || []).sort().join("+")}|${p.rate}`;
            if (!seen.has(k)) { seen.add(k); deduped.push(p); }
          }
          deduped.sort((a, b) => (b.rate || 0) - (a.rate || 0));
          let total = 0;
          for (let i = 0; i < Math.min(limit, deduped.length); i++) total += deduped[i].rate || 0;
          return total;
        })();

        return (
          <div className="modal-overlay" onClick={(e) => { if ((e.target as HTMLElement).classList.contains("modal-overlay")) { setDetailAccount(null); setDetailTab("pets"); setRarityFilter("ALL"); } }}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <span className="mh-name">{detailAccount.sourceAccount}</span>
                <span className={`mod-badge ${detailAccount.resolved ? "ok" : "warn"}`}>{detailAccount.resolved ? "RESOLVED" : "CAPTCHA"}</span>
                <button className="modal-close" onClick={() => { setDetailAccount(null); setDetailTab("pets"); setRarityFilter("ALL"); }}>&times;</button>
              </div>
              <div className="msub" style={{ padding: "0 24px 8px", color: "var(--dim)", fontSize: 12 }}>
                {detailAccount.resolved && detailAccount.resolvedAt ? `Resolved: ${fmtDate(detailAccount.resolvedAt)}` : detailAccount.moderatedAt ? `Moderated: ${fmtDate(detailAccount.moderatedAt)}` : ""}
                {deviceLabel(detailAccount.sourceAccount) && ` · ${deviceLabel(detailAccount.sourceAccount)}`}
              </div>

              <div className="modal-stats">
                <div className="ms-card"><div className="mslabel">CASH</div><div className="msval" style={{ color: "var(--gold)" }}>{fmtMoney(detailAccount.money)}</div></div>
                <div className="ms-card"><div className="mslabel">INCOME AKTIF</div><div className="msval" style={{ color: "var(--accent2)" }}>{fmtRate(d?.activePets ? d.activePets.reduce((s, p) => s + (p.rate || 0), 0) : detailAccount.incomeAktif)}</div></div>
                <div className="ms-card"><div className="mslabel">SPEED</div><div className="msval" style={{ color: "var(--accent)" }}>{fmtCompactNum(detailAccount.speed)}</div></div>
                <div className="ms-card"><div className="mslabel">KANDANG</div><div className="msval">{fmtLevel(detailAccount.kandangLevel)}</div></div>
                <div className="ms-card"><div className="mslabel">TREADMILL</div><div className="msval">{fmtLevel(detailAccount.treadmillLevel)}</div></div>
                <div className="ms-card"><div className="mslabel">ACTIVE LIMIT</div><div className="msval">{d?.activeLimit ?? "-"}</div></div>
                <div className="ms-card"><div className="mslabel">INCOME POTENSI</div><div className="msval" style={{ color: "var(--green)" }}>{fmtRate(incomePotensi)}</div></div>
                <div className="ms-card"><div className="mslabel">TOKEN MUTASI</div><div className="msval" style={{ color: "#a78bfa" }}>{fmtNum(detailAccount.mutationToken ?? 0)}</div></div>
                <div className="ms-card"><div className="mslabel">TOKEN SCRAMBLE</div><div className="msval" style={{ color: "var(--green)" }}>{detailAccount.scrambleToken != null ? fmtNum(detailAccount.scrambleToken) : "—"}</div></div>
                <div className="ms-card"><div className="mslabel">TOKEN NITRO</div><div className="msval" style={{ color: "#d97706" }}>{detailAccount.nitroToken != null ? fmtNum(detailAccount.nitroToken) : "—"}</div></div>
                <div className="ms-card"><div className="mslabel">TOKEN SPECTRAL</div><div className="msval" style={{ color: "#6366f1" }}>{detailAccount.spectralToken != null ? fmtNum(detailAccount.spectralToken) : "—"}</div></div>
              </div>

              {d ? (
                <>
                  <div className="modal-tabs">
                    <button className={`mtab ${detailTab === "pets" ? "active" : ""}`} onClick={() => { setDetailTab("pets"); setRarityFilter("ALL"); }}>
                      🐾 PETS ({petCount})
                    </button>
                    <button className={`mtab ${detailTab === "eggs" ? "active" : ""}`} onClick={() => { setDetailTab("eggs"); setRarityFilter("ALL"); }} style={(d.growingEggs?.length ?? 0) > 0 ? { color: "var(--green)" } : undefined}>
                      🥚 EGGS ({eggCount})
                    </button>
                    <button className={`mtab ${detailTab === "stolen" ? "active" : ""}`} onClick={() => { setDetailTab("stolen"); setRarityFilter("ALL"); }}>
                      🎯 STOLEN ({stolenCount})
                    </button>
                    <button className={`mtab ${detailTab === "tools" ? "active" : ""}`} onClick={() => { setDetailTab("tools"); setRarityFilter("ALL"); }}>
                      🛠️ TOOLS ({toolsCount})
                    </button>
                  </div>

                  {(detailTab === "pets" || detailTab === "eggs") && allItems.length > 0 && (
                    <>
                      <div className="rarity-chips">
                        {rarityOptions.map((r) => {
                          const isActive = rarityFilter === r;
                          const rc = r === "ALL" ? "var(--accent2)" : rarityColor(r);
                          return (
                            <button key={r} className={`rchip ${isActive ? "active" : ""}`} onClick={() => setRarityFilter(r)}
                              style={isActive ? { borderColor: rc, color: rc, background: rc + "18" } : undefined}>
                              {r.toUpperCase()} <span className="rchip-count">{rarityCounts[r] || 0}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="value-bar">VALUE: {fmtRate(totalValueRate)}</div>
                    </>
                  )}

                  <div className="modal-body">
                    {detailTab === "pets" && <PetGrid pets={filteredItems} idx={iconIdx} showBadges />}
                    {detailTab === "eggs" && (
                      <>
                        {(d.growingEggs?.length ?? 0) > 0 && (
                          <GrowingEggGrid eggs={d.growingEggs!.filter((e) => rarityFilter === "ALL" || (petRarity(e.category, iconIdx) || "Unknown") === rarityFilter)} idx={iconIdx} />
                        )}
                        {(d.backpackEggs?.length ?? 0) > 0 && (
                          <PetGrid pets={d.backpackEggs!.filter((e) => rarityFilter === "ALL" || (petRarity(e.category, iconIdx) || "Unknown") === rarityFilter).map((e) => ({ ...e, _bag: true }))} idx={iconIdx} showBadges />
                        )}
                        {eggCount === 0 && <div className="detail-empty">Belum ada telur.</div>}
                      </>
                    )}
                    {detailTab === "stolen" && (
                      stolenCount === 0
                        ? <div className="detail-empty">Belum ada pet stolen.</div>
                        : <PetGrid pets={(d.stolenItems || []) as unknown as Pet[]} idx={iconIdx} showBadges />
                    )}
                    {detailTab === "tools" && (
                      toolsCount === 0
                        ? <div className="detail-empty">Belum ada tools.</div>
                        : (
                          <div className="pet-grid">
                            {(d.tools || []).map((t, i) => (
                              <div key={i} className="pg-card">
                                <div className="pg-info">
                                  <div className="pg-name">{t.name || t.category || "Tool"}</div>
                                  <div className="pg-meta">
                                    {t.itemType && <span className="pg-rarity" style={{ background: "rgba(148,163,184,.15)", color: "var(--dim)", border: "1px solid rgba(148,163,184,.3)" }}>{t.itemType}</span>}
                                    {t.count != null && <span className="pg-rate">×{t.count}</span>}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                    )}
                  </div>
                </>
              ) : (
                <div style={{ padding: 40, textAlign: "center", color: "var(--dim)" }}>Detail pets tidak tersedia untuk akun ini.</div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
