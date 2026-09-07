"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface Pet {
  category: string;
  name?: string;
  rate: number;
  mutations?: string[];
}

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

const DIVINE_RARITIES = new Set(["Divine", "Eternal"]);
const ONE_BILLION = 1_000_000_000;

function pickHighlightPet(pets: Pet[], index: Record<string, string>): { highlight: Pet | null; main: Pet[] } {
  if (!pets || pets.length === 0) return { highlight: null, main: [] };

  const divineHighRate = pets
    .filter((p) => DIVINE_RARITIES.has(petRarity(p.category, index) || "") && (p.rate || 0) >= ONE_BILLION)
    .sort((a, b) => (b.rate || 0) - (a.rate || 0));

  let highlight: Pet;
  if (divineHighRate.length > 0) {
    highlight = divineHighRate[0];
  } else {
    const sorted = [...pets].sort((a, b) => (b.rate || 0) - (a.rate || 0));
    highlight = sorted[0];
  }

  const main = pets.filter((p) => p !== highlight).slice(0, 3);
  return { highlight, main };
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
    default: return "var(--dim)";
  }
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
      return (
        <img
          src={fallbackSrc}
          alt={name}
          width={size}
          height={size}
          style={{ borderRadius: 6, objectFit: "contain", background: "#1c1c2b", flexShrink: 0 }}
          onError={() => setFailed(true)}
        />
      );
    }
    return (
      <div style={{ width: size, height: size, borderRadius: 6, background: "#262640", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.35, color: "var(--dim)", flexShrink: 0 }}>
        {(name || "?")[0]}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      style={{ borderRadius: 6, objectFit: "contain", background: "#1c1c2b", flexShrink: 0 }}
      onError={() => {
        if (staticSrc && !failed) setSrc(fallbackSrc);
        else setFailed(true);
      }}
    />
  );
}

interface Account {
  sourceAccount: string;
  money: number | null;
  speed: number | null;
  incomeAktif: number | null;
  incomeEggBackpack: number | null;
  incomeEggSedangTumbuh: number | null;
  highValuePetTotal: number | null;
  kandangLevel: number | null;
  treadmillLevel: number | null;
  petsCount: number;
  stolenCount: number;
  growingEggCount?: number;
  backpackEggCount?: number;
  topPets: Pet[];
  online: boolean;
  firstSeen?: number;
  lastSeen?: number;
  forSale?: boolean;
}

interface AccountDetail {
  activePets: Pet[];
  activeLimit: number | null;
  allPets: Pet[];
  growingEggs: Pet[];
  backpackEggs: Pet[];
}

function fmtUptime(firstSeen?: number): string {
  if (!firstSeen) return "";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - firstSeen));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

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

function fmtNum(v: number | null | undefined): string {
  if (v == null) return "-";
  return Number(v).toLocaleString("en-US");
}

function fmtCompactNum(v: number | null | undefined): string {
  if (v == null) return "-";
  const n = Number(v);
  const abs = Math.abs(n);
  if (abs >= 1e18) return (n / 1e18).toFixed(1) + "Qi+";
  if (abs >= 1e15) return (n / 1e15).toFixed(1) + "Qa+";
  if (abs >= 1e12) return (n / 1e12).toFixed(1) + "T+";
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "B+";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M+";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K+";
  return n.toLocaleString("en-US");
}

function fmtRate(v: number | null | undefined): string {
  if (v == null) return "-";
  return fmtMoney(v) + "/s";
}

function fmtLevel(v: number | null | undefined): string {
  if (v == null) return "-";
  return "Lv. " + v;
}

function fmtLastSeen(lastSeen?: number): string {
  if (!lastSeen) return "Unknown";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - lastSeen));
  if (s < 60) return `${s}s lalu`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j ${m % 60}m lalu`;
  const d = Math.floor(h / 24);
  return `${d}h ${h % 24}j lalu`;
}

function accountNumber(name: string): number | null {
  const m = name.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function deviceBlockStart(num: number | null): number | null {
  if (num === null || isNaN(num)) return null;
  return Math.floor((num - 1) / 10) * 10 + 1;
}

function deviceLabel(name: string): string | null {
  const start = deviceBlockStart(accountNumber(name));
  return start === null ? null : "SAE " + start;
}

type TabMode = "all" | "online" | "offline";

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [sortMode, setSortMode] = useState("name_asc");
  const [deviceFilter, setDeviceFilter] = useState("");
  const [tabMode, setTabMode] = useState<TabMode>("all");
  const [detail, setDetail] = useState<{ name: string; data: AccountDetail | null; loading: boolean } | null>(null);
  const [genAllStatus, setGenAllStatus] = useState("");
  const [genAllRunning, setGenAllRunning] = useState(false);
  const genMsgs = useRef<Record<string, { text: string; color: string }>>({});
  const [, forceUpdate] = useState(0);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      const all = (data.accounts || []).filter((a: Account) => !a.forSale);
      setAccounts(all);
    } catch {}
  }, []);

  useEffect(() => {
    fetchAccounts();
    const id = setInterval(fetchAccounts, 5000);
    return () => clearInterval(id);
  }, [fetchAccounts]);

  function filterByDevice(list: Account[]): Account[] {
    if (!deviceFilter.trim()) return list;
    const queryNum = accountNumber(deviceFilter.trim());
    if (queryNum === null) return list;
    const wantBlock = deviceBlockStart(queryNum);
    return list.filter((a) => deviceBlockStart(accountNumber(a.sourceAccount)) === wantBlock);
  }

  function sortAccounts(list: Account[]): Account[] {
    const sorted = [...list];
    switch (sortMode) {
      case "speed_desc":
        sorted.sort((a, b) => (Number(b.speed) || 0) - (Number(a.speed) || 0));
        break;
      case "income_aktif_desc":
        sorted.sort((a, b) => (Number(b.incomeAktif) || 0) - (Number(a.incomeAktif) || 0));
        break;
      case "income_pasif_desc":
        sorted.sort(
          (a, b) =>
            (Number(b.incomeEggBackpack) || 0) +
            (Number(b.incomeEggSedangTumbuh) || 0) -
            ((Number(a.incomeEggBackpack) || 0) + (Number(a.incomeEggSedangTumbuh) || 0))
        );
        break;
      case "egg_desc":
        sorted.sort((a, b) => (Number(b.stolenCount) || 0) - (Number(a.stolenCount) || 0));
        break;
      case "akun_baru":
        return sorted
          .filter((a) => (a.treadmillLevel ?? -1) === 1)
          .sort((a, b) => (Number(b.incomeAktif) || 0) - (Number(a.incomeAktif) || 0));
      default:
        sorted.sort((a, b) => {
          const na = accountNumber(a.sourceAccount);
          const nb = accountNumber(b.sourceAccount);
          if (na !== null && nb !== null && na !== nb) return na - nb;
          return a.sourceAccount.localeCompare(b.sourceAccount);
        });
    }
    return sorted;
  }

  const filtered = filterByDevice(accounts);
  const allOnline = filtered.filter((a) => a.online);
  const allOffline = filtered.filter((a) => !a.online);

  const displayed = sortAccounts(
    tabMode === "online" ? allOnline : tabMode === "offline" ? allOffline : filtered
  );

  const totalMoney = allOnline.reduce((s, a) => s + (Number(a.money) || 0), 0);
  const totalIncome = allOnline.reduce((s, a) => s + (Number(a.incomeAktif) || 0), 0);
  const totalSpeed = allOnline.reduce((s, a) => s + (Number(a.speed) || 0), 0);
  const totalPets = allOnline.reduce((s, a) => s + (Number(a.petsCount) || 0), 0);
  const totalStolen = allOnline.reduce((s, a) => s + (Number(a.stolenCount) || 0), 0);
  const totalGrowing = filtered.reduce((s, a) => s + (Number(a.growingEggCount) || 0), 0);

  async function openDetail(name: string) {
    setDetail({ name, data: null, loading: true });
    try {
      const res = await fetch("/api/account-detail?account=" + encodeURIComponent(name));
      const body = await res.json();
      if (res.ok && body.ok) {
        setDetail({ name, data: body, loading: false });
      } else {
        setDetail({ name, data: null, loading: false });
      }
    } catch {
      setDetail({ name, data: null, loading: false });
    }
  }

  function setGenMsg(account: string, text: string, color: string) {
    genMsgs.current[account] = { text, color };
    forceUpdate((n) => n + 1);
  }

  async function generatePoster(account: string) {
    setGenMsg(account, "Mengirim...", "var(--dim)");
    try {
      const res = await fetch("/api/generate-poster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        setGenMsg(
          account,
          body.mode === "discord-price-flow"
            ? "Draft terkirim ke Discord (isi harga di sana)."
            : "Poster terkirim ke Discord.",
          "var(--green)"
        );
      } else {
        setGenMsg(account, "Gagal: " + (body.error || "unknown"), "#f87171");
      }
    } catch (e: any) {
      setGenMsg(account, "Gagal: " + e.message, "#f87171");
    }
  }

  async function markForSale(account: string) {
    setGenMsg(account, "Memindahkan ke katalog...", "var(--dim)");
    try {
      const res = await fetch("/api/mark-forsale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, forSale: true }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setGenMsg(account, "Gagal: " + (body.error || "unknown"), "#f87171");
        return;
      }
      setAccounts((prev) => prev.filter((a) => a.sourceAccount !== account));
      setGenMsg(account, "Akun dipindah, membuka package buat logout...", "var(--dim)");

      try {
        const lres = await fetch("/api/device-control/launch-by-username", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: account }),
        });
        const lbody = await lres.json();
        if (lres.ok && lbody.ok) {
          setGenMsg(account, `Package dibuka di ${lbody.hostname}.`, "var(--green)");
        } else {
          setGenMsg(account, "Katalog OK, tapi launch gagal: " + (lbody.error || "unknown"), "#f59e0b");
        }
      } catch (e: any) {
        setGenMsg(account, "Katalog OK, tapi launch error: " + e.message, "#f59e0b");
      }
    } catch (e: any) {
      setGenMsg(account, "Gagal: " + e.message, "#f87171");
    }
  }

  async function generateAll() {
    const targets = displayed.filter((a) => a.online);
    if (genAllRunning || targets.length === 0) return;
    setGenAllRunning(true);
    let ok = 0, fail = 0;
    for (let i = 0; i < targets.length; i++) {
      const acc = targets[i].sourceAccount;
      setGenAllStatus(`Generate ${i + 1}/${targets.length}: ${acc}...`);
      try {
        const res = await fetch("/api/generate-poster", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account: acc }),
        });
        const body = await res.json();
        if (res.ok && body.ok) ok++;
        else fail++;
      } catch {
        fail++;
      }
      if (i < targets.length - 1) await new Promise((r) => setTimeout(r, 700));
    }
    setGenAllStatus(`Selesai: ${ok} berhasil${fail ? `, ${fail} gagal` : ""}.`);
    setGenAllRunning(false);
  }

  return (
    <>
      <style>{`
        :root {
          --bg: #0a0a14; --surface: #10101c; --card: #141422; --card-border: #1e1e32;
          --ink: #e8e8f0; --dim: #6b6b88; --accent: #a78bfa; --accent2: #22d3ee;
          --green: #34d399; --gold: #fbbf24; --red: #ef4444; --orange: #f59e0b;
        }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--bg); color: var(--ink); font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }

        .dash { max-width: 1600px; margin: 0 auto; padding: 24px 28px 40px; }

        /* Header */
        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
        .header-left .eyebrow { color: var(--accent2); font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 4px; }
        .header-left h1 { font-size: 24px; margin: 0; color: var(--ink); font-weight: 900; }
        .header-right { display: flex; align-items: center; gap: 12px; }
        .conn-badge { display: flex; align-items: center; gap: 6px; background: var(--surface); border: 1px solid var(--card-border); border-radius: 8px; padding: 6px 14px; font-size: 12px; font-weight: 700; color: var(--green); }
        .conn-badge .cdot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); box-shadow: 0 0 8px var(--green); }

        /* Summary row */
        .summary-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 24px; }
        .sum-card { background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 14px 16px; border-left: 3px solid var(--dim); }
        .sum-card .slabel { font-size: 10px; font-weight: 800; letter-spacing: .8px; text-transform: uppercase; margin-bottom: 6px; }
        .sum-card .sval { font-size: 22px; font-weight: 900; }
        .sum-card .ssub { font-size: 11px; color: var(--dim); margin-top: 2px; }

        /* Tabs + toolbar */
        .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
        .tabs { display: flex; gap: 0; background: var(--surface); border: 1px solid var(--card-border); border-radius: 10px; overflow: hidden; }
        .tab { padding: 8px 18px; font-size: 12px; font-weight: 800; letter-spacing: .5px; cursor: pointer; color: var(--dim); background: transparent; border: none; transition: all .15s; display: flex; align-items: center; gap: 6px; }
        .tab:hover { color: var(--ink); }
        .tab.active { background: var(--accent); color: #1a1030; }
        .tab.active.online-tab { background: var(--green); color: #0a2018; }
        .tab.active.offline-tab { background: var(--red); color: #fff; }
        .tab .tcount { font-size: 10px; font-weight: 900; opacity: .8; }

        .tool-sep { width: 1px; height: 28px; background: var(--card-border); }
        .toolbar label { color: var(--dim); font-size: 11px; font-weight: 800; }
        .toolbar select, .toolbar input {
          background: var(--card); color: var(--ink); border: 1px solid var(--card-border);
          border-radius: 8px; padding: 7px 12px; font-size: 12px; font-weight: 700;
        }
        .toolbar select:focus, .toolbar input:focus { outline: none; border-color: var(--accent); }
        .toolbar input { width: 170px; }
        .genallbtn {
          margin-left: auto; background: var(--accent); color: #1a1030; border: none; border-radius: 8px;
          padding: 8px 16px; font-size: 12px; font-weight: 800; cursor: pointer;
        }
        .genallbtn:hover { filter: brightness(1.1); }
        .genallbtn:disabled { opacity: .5; cursor: default; }
        .genallstatus { color: var(--dim); font-size: 11px; }

        /* Grid */
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }

        /* Account card */
        .card { background: var(--card); border: 1px solid var(--card-border); border-radius: 14px; padding: 16px; cursor: pointer; transition: all .15s; position: relative; overflow: hidden; }
        .card:hover { border-color: var(--accent); transform: translateY(-1px); box-shadow: 0 4px 20px rgba(0,0,0,.3); }
        .card.is-offline { opacity: .5; }
        .card.is-offline:hover { opacity: .8; border-color: var(--dim); }

        .card-top { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .status-dot.on { background: var(--green); box-shadow: 0 0 8px var(--green); }
        .status-dot.off { background: var(--red); box-shadow: 0 0 6px rgba(239,68,68,.4); }
        .acc-name { font-weight: 800; font-size: 14px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dev-tag { color: var(--accent2); font-size: 9px; font-weight: 800; background: rgba(34,211,238,.08); border: 1px solid rgba(34,211,238,.2); border-radius: 5px; padding: 2px 6px; flex-shrink: 0; }
        .time-tag { font-size: 10px; font-weight: 700; flex-shrink: 0; }
        .time-tag.on { color: var(--dim); }
        .time-tag.off { color: var(--red); }

        /* Stats 2x4 grid */
        .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 12px; margin-bottom: 10px; }
        .st .sl { font-size: 9px; font-weight: 800; color: var(--dim); letter-spacing: .3px; text-transform: uppercase; }
        .st .sv { font-size: 14px; font-weight: 800; }
        .st.speed .sv { color: var(--accent); }
        .st.money .sv { color: var(--gold); }
        .st.income .sv { color: var(--accent2); }

        /* Growing eggs bar */
        .egg-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding: 6px 10px; background: rgba(52,211,153,.06); border: 1px solid rgba(52,211,153,.15); border-radius: 8px; }
        .egg-bar-icon { font-size: 14px; }
        .egg-bar-info { flex: 1; min-width: 0; }
        .egg-bar-label { font-size: 9px; font-weight: 800; color: var(--green); letter-spacing: .3px; text-transform: uppercase; }
        .egg-bar-track { height: 4px; background: rgba(52,211,153,.15); border-radius: 2px; margin-top: 3px; overflow: hidden; }
        .egg-bar-fill { height: 100%; background: var(--green); border-radius: 2px; transition: width .3s; }
        .egg-bar-count { font-size: 13px; font-weight: 900; color: var(--green); }

        /* Pet section */
        .pet-section { display: flex; gap: 6px; margin-bottom: 10px; }
        .highlight-card {
          background: linear-gradient(135deg, #1a1030 0%, #14141f 100%);
          border: 1px solid #a78bfa44; border-radius: 10px; padding: 8px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          min-width: 80px; text-align: center; gap: 3px; position: relative; overflow: hidden;
        }
        .highlight-card::before {
          content: ""; position: absolute; inset: 0; border-radius: 10px;
          background: radial-gradient(ellipse at 50% 0%, rgba(167,139,250,.12) 0%, transparent 70%);
          pointer-events: none;
        }
        .highlight-badge { font-size: 7px; font-weight: 800; letter-spacing: .5px; padding: 1px 5px; border-radius: 3px; text-transform: uppercase; }
        .highlight-card .pname { font-size: 9px; color: var(--ink); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 72px; }
        .highlight-card .prate { font-size: 10px; font-weight: 800; }
        .toppets { display: flex; gap: 5px; overflow-x: auto; flex: 1; }
        .pet { background: #1a1a2e; border: 1px solid var(--card-border); border-radius: 7px; padding: 5px 6px; text-align: center; min-width: 64px; display: flex; flex-direction: column; align-items: center; gap: 3px; flex: 1; }
        .pet .pname { font-size: 8px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 56px; }
        .pet .prate { font-size: 9px; color: var(--gold); font-weight: 700; }

        /* Action buttons */
        .card-actions { display: flex; gap: 6px; margin-top: 10px; }
        .act-btn { flex: 1; border: none; border-radius: 8px; padding: 7px 8px; font-size: 11px; font-weight: 800; cursor: pointer; text-align: center; text-decoration: none; display: block; }
        .act-btn:hover { filter: brightness(1.15); }
        .act-poster { background: var(--accent); color: #1a1030; }
        .act-sell { background: var(--surface); color: var(--ink); border: 1px solid var(--card-border) !important; }
        .act-sell:hover { border-color: var(--accent2) !important; }
        .genmsg { font-size: 10px; margin-top: 4px; min-height: 12px; }

        .empty { color: var(--dim); text-align: center; padding: 60px 0; font-size: 14px; }

        /* Modal */
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.7); display: flex; align-items: flex-start; justify-content: center; padding: 40px 16px; overflow-y: auto; z-index: 50; backdrop-filter: blur(4px); }
        .modal { background: var(--card); border: 1px solid var(--card-border); border-radius: 16px; padding: 24px; width: 100%; max-width: 720px; }
        .modal-head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
        .modal-head .acc-name { font-size: 20px; }
        .modal-close { margin-left: auto; background: none; border: none; color: var(--dim); font-size: 22px; cursor: pointer; line-height: 1; }
        .modal-close:hover { color: var(--ink); }
        .modal-sub { color: var(--dim); font-size: 12px; margin-bottom: 18px; }
        .section-title { color: var(--accent2); font-size: 12px; font-weight: 800; letter-spacing: .5px; margin: 18px 0 8px; }
        .detail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
        .dpet { background: #1a1a2e; border: 1px solid var(--card-border); border-radius: 8px; padding: 6px 8px; display: flex; align-items: center; gap: 8px; }
        .dpet .dinfo { min-width: 0; }
        .dpet .dname { font-size: 11px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dpet .drate { font-size: 11px; color: var(--gold); font-weight: 700; }
        .detail-empty { color: var(--dim); font-size: 12px; }
      `}</style>

      <div className="dash">
        {/* Header */}
        <div className="header">
          <div className="header-left">
            <div className="eyebrow">STEAL AN EGG</div>
            <h1>Monitor Dashboard</h1>
          </div>
          <div className="header-right">
            <div className="conn-badge">
              <span className="cdot" />
              {allOnline.length} / {filtered.length} Online
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="summary-row">
          <div className="sum-card" style={{ borderLeftColor: "var(--green)" }}>
            <div className="slabel" style={{ color: "var(--green)" }}>ACTIVE ACCOUNTS</div>
            <div className="sval">{allOnline.length} <span style={{ color: "var(--dim)", fontSize: 14, fontWeight: 700 }}>/ {filtered.length}</span></div>
            <div className="ssub">{allOffline.length} offline</div>
          </div>
          <div className="sum-card" style={{ borderLeftColor: "var(--gold)" }}>
            <div className="slabel" style={{ color: "var(--gold)" }}>TOTAL MONEY</div>
            <div className="sval" style={{ color: "var(--gold)" }}>{fmtMoney(totalMoney)}</div>
          </div>
          <div className="sum-card" style={{ borderLeftColor: "var(--accent2)" }}>
            <div className="slabel" style={{ color: "var(--accent2)" }}>TOTAL INCOME</div>
            <div className="sval" style={{ color: "var(--accent2)" }}>{fmtRate(totalIncome)}</div>
          </div>
          <div className="sum-card" style={{ borderLeftColor: "var(--accent)" }}>
            <div className="slabel" style={{ color: "var(--accent)" }}>TOTAL SPEED</div>
            <div className="sval">{fmtCompactNum(totalSpeed)}</div>
          </div>
          <div className="sum-card" style={{ borderLeftColor: "#818cf8" }}>
            <div className="slabel" style={{ color: "#818cf8" }}>TOTAL PETS</div>
            <div className="sval">{fmtNum(totalPets)}</div>
          </div>
          <div className="sum-card" style={{ borderLeftColor: "var(--green)" }}>
            <div className="slabel" style={{ color: "var(--green)" }}>GROWING EGGS</div>
            <div className="sval" style={{ color: "var(--green)" }}>{fmtNum(totalGrowing)}</div>
            <div className="ssub">{fmtNum(totalStolen)} stolen total</div>
          </div>
        </div>

        {/* Toolbar: tabs + sort + filter */}
        <div className="toolbar">
          <div className="tabs">
            <button className={`tab ${tabMode === "all" ? "active" : ""}`} onClick={() => setTabMode("all")}>
              ALL <span className="tcount">{filtered.length}</span>
            </button>
            <button className={`tab online-tab ${tabMode === "online" ? "active" : ""}`} onClick={() => setTabMode("online")}>
              ONLINE <span className="tcount">{allOnline.length}</span>
            </button>
            <button className={`tab offline-tab ${tabMode === "offline" ? "active" : ""}`} onClick={() => setTabMode("offline")}>
              OFFLINE <span className="tcount">{allOffline.length}</span>
            </button>
          </div>

          <div className="tool-sep" />

          <label>Sort:</label>
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
            <option value="name_asc">Nama (Nomor)</option>
            <option value="speed_desc">Speed Tertinggi</option>
            <option value="income_aktif_desc">Income Aktif Tertinggi</option>
            <option value="income_pasif_desc">Income Pasif Tertinggi</option>
            <option value="egg_desc">Egg Terbanyak</option>
            <option value="akun_baru">Akun Baru (TM Lv.1)</option>
          </select>

          <label>Device:</label>
          <input
            type="text"
            placeholder="cth: 21 (SAE 21-30)"
            value={deviceFilter}
            onChange={(e) => setDeviceFilter(e.target.value)}
          />

          <button className="genallbtn" disabled={genAllRunning || allOnline.length === 0} onClick={generateAll}>
            Generate All Poster
          </button>
          {genAllStatus && <span className="genallstatus">{genAllStatus}</span>}
        </div>

        {/* Cards grid */}
        {displayed.length === 0 ? (
          <div className="empty">
            {accounts.length > 0
              ? tabMode === "offline"
                ? "Tidak ada akun offline saat ini."
                : tabMode === "online"
                ? "Tidak ada akun online saat ini."
                : "Ga ada akun yang cocok sama filter itu."
              : 'Belum ada akun yang lapor. Nyalain "Auto Report ke Dashboard" di GUI game.'}
          </div>
        ) : (
          <div className="grid">
            {displayed.map((a) => (
              <AccountCard
                key={a.sourceAccount}
                account={a}
                onOpen={openDetail}
                onSell={markForSale}
                genMsg={genMsgs.current[a.sourceAccount]}
              />
            ))}
          </div>
        )}

        {/* Detail modal */}
        {detail && (
          <div className="overlay" onClick={(e) => { if ((e.target as HTMLElement).classList.contains("overlay")) setDetail(null); }}>
            <div className="modal">
              <div className="modal-head">
                <span className="acc-name">{detail.name}</span>
                <button className="modal-close" onClick={() => setDetail(null)}>&times;</button>
              </div>
              {detail.loading ? (
                <div className="modal-sub">Memuat...</div>
              ) : !detail.data ? (
                <div className="modal-sub">Belum ada data lengkap buat akun ini.</div>
              ) : (
                <>
                  <div className="modal-sub">Active Limit: {detail.data.activeLimit ?? "-"}</div>
                  <PetSection title="Pet Aktif" pets={detail.data.activePets} />
                  <PetSection title="Isi Tas (Semua Pet)" pets={detail.data.allPets} />
                  <PetSection title="Telur Sedang Tumbuh" pets={detail.data.growingEggs} />
                  <PetSection title="Telur di Tas" pets={detail.data.backpackEggs} />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function AccountCard({ account: a, onOpen, onSell, genMsg }: {
  account: Account;
  onOpen: (name: string) => void;
  onSell: (name: string) => void;
  genMsg?: { text: string; color: string };
}) {
  const isOff = !a.online;
  const eggCount = a.growingEggCount || 0;
  const eggCap = 20;
  const eggPct = Math.min(100, Math.round((eggCount / eggCap) * 100));

  return (
    <div className={`card ${isOff ? "is-offline" : ""}`} onClick={() => onOpen(a.sourceAccount)}>
      {/* Header row */}
      <div className="card-top">
        <span className={`status-dot ${isOff ? "off" : "on"}`} />
        <span className="acc-name">{a.sourceAccount}</span>
        {deviceLabel(a.sourceAccount) && <span className="dev-tag">{deviceLabel(a.sourceAccount)}</span>}
        <span className={`time-tag ${isOff ? "off" : "on"}`}>
          {isOff ? fmtLastSeen(a.lastSeen) : fmtUptime(a.firstSeen) || "Active"}
        </span>
      </div>

      {/* Stats grid */}
      <div className="stats">
        <div className="st speed">
          <div className="sl">SPEED</div>
          <div className="sv">{fmtCompactNum(a.speed)}</div>
        </div>
        <div className="st money">
          <div className="sl">CASH</div>
          <div className="sv">{fmtMoney(a.money)}</div>
        </div>
        <div className="st income">
          <div className="sl">INCOME AKTIF</div>
          <div className="sv">{fmtRate(a.incomeAktif)}</div>
        </div>
        <div className="st">
          <div className="sl">POTENSI 18 PET</div>
          <div className="sv">{fmtRate(a.highValuePetTotal)}</div>
        </div>
        <div className="st">
          <div className="sl">KANDANG</div>
          <div className="sv">{fmtLevel(a.kandangLevel)}</div>
        </div>
        <div className="st">
          <div className="sl">TREADMILL</div>
          <div className="sv">{fmtLevel(a.treadmillLevel)}</div>
        </div>
        <div className="st">
          <div className="sl">PETS</div>
          <div className="sv">{fmtNum(a.petsCount)}</div>
        </div>
        <div className="st">
          <div className="sl">STOLEN</div>
          <div className="sv">{fmtNum(a.stolenCount)}</div>
        </div>
      </div>

      {/* Growing eggs bar */}
      {eggCount > 0 && (
        <div className="egg-bar">
          <span className="egg-bar-icon">&#x1F95A;</span>
          <div className="egg-bar-info">
            <div className="egg-bar-label">GROWING EGGS</div>
            <div className="egg-bar-track">
              <div className="egg-bar-fill" style={{ width: eggPct + "%" }} />
            </div>
          </div>
          <span className="egg-bar-count">{eggCount}</span>
        </div>
      )}

      {/* Top pets */}
      <PetCards pets={a.topPets || []} />

      {/* Action buttons */}
      <div className="card-actions">
        <a
          className="act-btn act-poster"
          href={`/poster?account=${encodeURIComponent(a.sourceAccount)}`}
          onClick={(e) => e.stopPropagation()}
        >
          Poster
        </a>
        <button
          className="act-btn act-sell"
          onClick={(e) => { e.stopPropagation(); onSell(a.sourceAccount); }}
        >
          Siap Jual
        </button>
      </div>
      <div className="genmsg" style={{ color: genMsg?.color || "var(--dim)" }}>
        {genMsg?.text || ""}
      </div>
    </div>
  );
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
          <span className="highlight-badge" style={{ background: hlColor + "22", color: hlColor }}>
            {hlRarity || "TOP"}
          </span>
          <PetIcon category={highlight.category} name={highlight.name || highlight.category} size={36} />
          <div className="pname">{highlight.name || highlight.category}</div>
          <div className="prate" style={{ color: hlColor }}>{fmtRate(highlight.rate)}</div>
        </div>
      )}
      <div className="toppets">
        {main.map((p, i) => (
          <div key={i} className="pet">
            <PetIcon category={p.category} name={p.name || p.category} size={28} />
            <div className="pname">{p.name || p.category}</div>
            <div className="prate">{fmtRate(p.rate)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PetSection({ title, pets }: { title: string; pets: Pet[] }) {
  const sorted = [...(pets || [])].sort((a, b) => (b.rate || 0) - (a.rate || 0));
  return (
    <>
      <div className="section-title">
        {title} ({sorted.length})
      </div>
      {sorted.length === 0 ? (
        <div className="detail-empty">Kosong.</div>
      ) : (
        <div className="detail-grid">
          {sorted.map((p, i) => (
            <div key={i} className="dpet">
              <PetIcon category={p.category} name={p.name || p.category} size={28} />
              <div className="dinfo">
                <div className="dname">
                  {p.name || p.category}
                  {(p.mutations || []).length > 0 && ` (${p.mutations!.join(", ")})`}
                </div>
                <div className="drate">{fmtRate(p.rate)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
