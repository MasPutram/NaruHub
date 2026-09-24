"use client";

import { useEffect, useState, useCallback, useRef } from "react";

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
  // Presentation-only flags added by DetailModal.petsForTab; not part of the
  // API response. `_equipped` marks a pet currently in the equip slot,
  // `_bag` marks one sitting in the backpack (or a backpack egg).
  _equipped?: boolean;
  _bag?: boolean;
  _from?: string;
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
  if (divineHighRate.length > 0) highlight = divineHighRate[0];
  else highlight = [...pets].sort((a, b) => (b.rate || 0) - (a.rate || 0))[0];
  const main = pets.filter((p) => p !== highlight).slice(0, 3);
  return { highlight, main };
}

function mutationClass(name: string): string {
  const k = String(name || "").trim().toLowerCase();
  if (!k) return "pg-mutation mut-default";
  // Named mutations get their own colored badge; anything unknown falls back
  // to the generic purple pill so the label still renders.
  if (/^gold/.test(k)) return "pg-mutation mut-golden";
  if (/^silver/.test(k)) return "pg-mutation mut-silver";
  if (/^rainbow/.test(k)) return "pg-mutation mut-rainbow";
  if (/^fract/.test(k) || k === "boss fractured") return "pg-mutation mut-fractured";
  if (/^boss/.test(k)) return "pg-mutation mut-boss";
  if (/^sakura/.test(k)) return "pg-mutation mut-sakura";
  if (/^froz/.test(k) || k === "ice") return "pg-mutation mut-frozen";
  if (/^magma/.test(k) || k === "lava") return "pg-mutation mut-magma";
  if (/^candy/.test(k)) return "pg-mutation mut-candy";
  if (/^shock/.test(k)) return "pg-mutation mut-shocked";
  if (/^scare/.test(k)) return "pg-mutation mut-scared";
  if (/^alpha/.test(k)) return "pg-mutation mut-alpha";
  if (k === "2x" || /^double/.test(k)) return "pg-mutation mut-2x";
  return "pg-mutation mut-default";
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

interface Account {
  sourceAccount: string;
  money: number | null;
  speed: number | null;
  incomeAktif: number | null;
  incomePotensi: number | null;
  incomeEggBackpack: number | null;
  incomeEggSedangTumbuh: number | null;
  highValuePetTotal: number | null;
  kandangLevel: number | null;
  treadmillLevel: number | null;
  petsCount: number;
  stolenCount: number;
  bossToken?: number | null;
  mutationToken?: number | null;
  scrambleToken?: number | null;
  trail?: string | null;
  growingEggCount?: number;
  backpackEggCount?: number;
  topPets: Pet[];
  online: boolean;
  firstSeen?: number;
  lastSeen?: number;
  forSale?: boolean;
  deviceId?: string;
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
interface AccountDetail {
  activePets: Pet[];
  activeLimit: number | null;
  allPets: Pet[];
  growingEggs: Pet[];
  backpackEggs: Pet[];
  stolenItems?: StolenItem[];
  tools?: ToolItem[];
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

function fmtLevelMax(v: number | null | undefined, maxLevel: number): { text: string; isMax: boolean } {
  if (v == null) return { text: "-", isMax: false };
  const isMax = v >= maxLevel && maxLevel > 0;
  return { text: isMax ? `Lv. ${v} MAX` : `Lv. ${v}`, isMax };
}

const POTENSI_EQUIP = 19;

function equipSlots(): number {
  return POTENSI_EQUIP;
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

function fmtEggTimer(sec?: number): string {
  if (sec == null || sec <= 0) return "Siap!";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}j ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(sec)}s`;
}

function accountNumber(name: string): number | null {
  const m = name.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function deviceLabel(deviceId?: string, deviceMap?: Record<string, string>): string | null {
  if (!deviceId || !deviceMap || !deviceMap[deviceId]) return null;
  return deviceMap[deviceId];
}

type TabMode = "all" | "online" | "offline";
type DetailTab = "pets" | "eggs" | "stolen" | "tools";
type AllDetailTab = "accounts" | "pets" | "eggs" | "stolen" | "tools" | "work";

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [sortMode, setSortMode] = useState("name_asc");
  const [deviceFilter, setDeviceFilter] = useState("");
  const [tabMode, setTabMode] = useState<TabMode>("all");
  const [detail, setDetail] = useState<{ name: string; data: AccountDetail | null; loading: boolean; account: Account | null } | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("pets");
  const [allDetail, setAllDetail] = useState<{ accounts: Account[]; details: Record<string, AccountDetail>; loading: boolean } | null>(null);
  const [allDetailTab, setAllDetailTab] = useState<AllDetailTab>("accounts");
  const [genAllStatus, setGenAllStatus] = useState("");
  const [genAllRunning, setGenAllRunning] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const genMsgs = useRef<Record<string, { text: string; color: string }>>({});
  const [, forceUpdate] = useState(0);
  const [deviceMap, setDeviceMap] = useState<Record<string, string>>({});

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      const all = (data.accounts || []).filter((a: Account) => !a.forSale);
      setAccounts(all);
    } catch {}
  }, []);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/termux/devices");
      const data = await res.json();
      if (data.ok && data.devices) {
        const map: Record<string, string> = {};
        for (const d of data.devices) {
          if (d.deviceId) map[d.deviceId] = d.customName || d.hostname || d.deviceId;
        }
        setDeviceMap(map);
      }
    } catch {}
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchAccounts();
    fetchDevices();
    const id = setInterval(fetchAccounts, 5000);
    const id2 = setInterval(fetchDevices, 30000);
    return () => { clearInterval(id); clearInterval(id2); };
  }, [fetchAccounts, fetchDevices]);

  function filterByDevice(list: Account[]): Account[] {
    if (!deviceFilter.trim()) return list;
    const q = deviceFilter.trim().toLowerCase();
    return list.filter((a) => {
      const label = deviceLabel(a.deviceId, deviceMap);
      return label ? label.toLowerCase().includes(q) : false;
    });
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
      case "income_potensi_desc":
        sorted.sort((a, b) => (Number(b.incomePotensi) || 0) - (Number(a.incomePotensi) || 0));
        break;
      case "egg_desc":
        sorted.sort((a, b) => (Number(b.stolenCount) || 0) - (Number(a.stolenCount) || 0));
        break;
      case "work":
        sorted.sort((a, b) => (Number(b.incomePotensi) || 0) - (Number(a.incomePotensi) || 0));
        break;
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
  const maxKandang = filtered.reduce((m, a) => Math.max(m, a.kandangLevel ?? 0), 0);
  const maxTreadmill = filtered.reduce((m, a) => Math.max(m, a.treadmillLevel ?? 0), 0);

  async function openDetail(name: string) {
    const acc = accounts.find((a) => a.sourceAccount === name) || null;
    setDetail({ name, data: null, loading: true, account: acc });
    setDetailTab("pets");
    try {
      const res = await fetch("/api/account-detail?account=" + encodeURIComponent(name));
      const body = await res.json();
      if (res.ok && body.ok) setDetail({ name, data: body, loading: false, account: acc });
      else setDetail({ name, data: null, loading: false, account: acc });
    } catch {
      setDetail({ name, data: null, loading: false, account: acc });
    }
  }

  async function openAllDetail(list: Account[]) {
    // Snapshot the currently-displayed accounts so the modal shows the same
    // scope the user was looking at (respects online/offline/device filter).
    const snapshot = [...list];
    setAllDetail({ accounts: snapshot, details: {}, loading: true });
    setAllDetailTab("accounts");
    try {
      const results = await Promise.all(
        snapshot.map(async (a) => {
          try {
            const res = await fetch("/api/account-detail?account=" + encodeURIComponent(a.sourceAccount));
            const body = await res.json();
            if (res.ok && body.ok) return [a.sourceAccount, body as AccountDetail] as const;
          } catch {}
          return [a.sourceAccount, null] as const;
        })
      );
      const details: Record<string, AccountDetail> = {};
      for (const [name, data] of results) if (data) details[name] = data;
      setAllDetail({ accounts: snapshot, details, loading: false });
    } catch {
      setAllDetail({ accounts: snapshot, details: {}, loading: false });
    }
  }

  function setGenMsg(account: string, text: string, color: string) {
    genMsgs.current[account] = { text, color };
    forceUpdate((n) => n + 1);
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
      if (!res.ok || !body.ok) { setGenMsg(account, "Gagal: " + (body.error || "unknown"), "#f87171"); return; }
      setAccounts((prev) => prev.filter((a) => a.sourceAccount !== account));
      // Script (StealAnEgg.luau) polls /api/monitor and sees forSale:true in the
      // next heartbeat response -- it Kicks the clone to Roblox home so the
      // operator can manually log out. No relaunch needed: the auto-rejoin
      // brain now skips a running-but-not-in-game app (home screen).
      setGenMsg(account, "Katalog OK. Script Kick ke home dalam ~10 detik.", "var(--green)");
    } catch (e: any) {
      setGenMsg(account, "Gagal: " + e.message, "#f87171");
    }
  }

  async function markModerated(account: string) {
    setGenMsg(account, "Memindahkan ke moderated...", "var(--dim)");
    try {
      const res = await fetch("/api/mark-moderated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) { setGenMsg(account, "Gagal: " + (body.error || "unknown"), "#f87171"); return; }
      setAccounts((prev) => prev.filter((a) => a.sourceAccount !== account));
      setGenMsg(account, "Dipindahkan ke Moderated.", "var(--green)");
    } catch (e: any) {
      setGenMsg(account, "Gagal: " + e.message, "#f87171");
    }
  }

  async function deleteAccount(account: string) {
    try {
      const res = await fetch("/api/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        setAccounts((prev) => prev.filter((a) => a.sourceAccount !== account));
      }
    } catch {}
    setDeleteConfirm(null);
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
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account: acc }),
        });
        const body = await res.json();
        if (res.ok && body.ok) ok++; else fail++;
      } catch { fail++; }
      if (i < targets.length - 1) await new Promise((r) => setTimeout(r, 700));
    }
    setGenAllStatus(`Selesai: ${ok} berhasil${fail ? `, ${fail} gagal` : ""}.`);
    setGenAllRunning(false);
  }

  if (!mounted) return null;

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

        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
        .header-left .eyebrow { color: var(--accent2); font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 4px; }
        .header-left h1 { font-size: 24px; margin: 0; font-weight: 900; }
        .conn-badge { display: flex; align-items: center; gap: 6px; background: var(--surface); border: 1px solid var(--card-border); border-radius: 8px; padding: 6px 14px; font-size: 12px; font-weight: 700; color: var(--green); }
        .conn-badge .cdot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); box-shadow: 0 0 8px var(--green); }

        .summary-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 24px; }
        .sum-card { background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 14px 16px; border-left: 3px solid var(--dim); }
        .sum-card .slabel { font-size: 10px; font-weight: 800; letter-spacing: .8px; text-transform: uppercase; margin-bottom: 6px; }
        .sum-card .sval { font-size: 22px; font-weight: 900; }
        .sum-card .ssub { font-size: 11px; color: var(--dim); margin-top: 2px; }

        .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
        .tabs { display: flex; background: var(--surface); border: 1px solid var(--card-border); border-radius: 10px; overflow: hidden; }
        .tab { padding: 8px 18px; font-size: 12px; font-weight: 800; letter-spacing: .5px; cursor: pointer; color: var(--dim); background: transparent; border: none; transition: all .15s; display: flex; align-items: center; gap: 6px; }
        .tab:hover { color: var(--ink); }
        .tab.active { background: var(--accent); color: #1a1030; }
        .tab.active.online-tab { background: var(--green); color: #0a2018; }
        .tab.active.offline-tab { background: var(--red); color: #fff; }
        .tab .tcount { font-size: 10px; font-weight: 900; opacity: .8; }
        .tool-sep { width: 1px; height: 28px; background: var(--card-border); }
        .toolbar label { color: var(--dim); font-size: 11px; font-weight: 800; }
        .toolbar select, .toolbar input { background: var(--card); color: var(--ink); border: 1px solid var(--card-border); border-radius: 8px; padding: 7px 12px; font-size: 12px; font-weight: 700; }
        .toolbar select:focus, .toolbar input:focus { outline: none; border-color: var(--accent); }
        .toolbar input { width: 170px; }
        .genallbtn { margin-left: auto; background: var(--accent); color: #1a1030; border: none; border-radius: 8px; padding: 8px 16px; font-size: 12px; font-weight: 800; cursor: pointer; }
        .genallbtn:hover { filter: brightness(1.1); }
        .genallbtn:disabled { opacity: .5; cursor: default; }
        .genallstatus { color: var(--dim); font-size: 11px; }

        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }

        .card { background: var(--card); border: 1px solid var(--card-border); border-radius: 14px; padding: 16px; cursor: pointer; transition: all .15s; position: relative; }
        .card:hover { border-color: var(--accent); transform: translateY(-1px); box-shadow: 0 4px 20px rgba(0,0,0,.3); }
        .card.is-offline { opacity: .5; }
        .card.is-offline:hover { opacity: .8; border-color: var(--dim); }
        .card-top { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .status-dot.on { background: var(--green); box-shadow: 0 0 8px var(--green); }
        .status-dot.off { background: var(--red); box-shadow: 0 0 6px rgba(239,68,68,.4); }
        .acc-name { font-weight: 800; font-size: 14px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dev-tag { color: var(--accent2); font-size: 9px; font-weight: 800; background: rgba(34,211,238,.08); border: 1px solid rgba(34,211,238,.2); border-radius: 5px; padding: 2px 6px; flex-shrink: 0; }
        .st.boss { background: linear-gradient(135deg, #7c3aed, #a78bfa); border-radius: 8px; padding: 5px 10px; }
        .st.boss .sl { color: #fff; }
        .st.boss .sv { color: #fff; font-size: 18px; }
        .st.scramble { background: linear-gradient(135deg, #059669, #34d399); border-radius: 8px; padding: 5px 10px; }
        .st.scramble .sl { color: #fff; }
        .st.scramble .sv { color: #fff; font-size: 18px; }
        .time-tag { font-size: 10px; font-weight: 700; flex-shrink: 0; }
        .time-tag.on { color: var(--dim); }
        .time-tag.off { color: var(--red); }

        /* Aggregated "All Accounts" combined card */
        .card.combined { background: linear-gradient(135deg, rgba(34,211,238,.06), rgba(139,92,246,.06)), var(--card); border-color: rgba(34,211,238,.28); cursor: pointer; }
        .card.combined:hover { transform: translateY(-1px); box-shadow: 0 0 0 1px rgba(34,211,238,.45), 0 6px 22px rgba(34,211,238,.12); border-color: rgba(34,211,238,.55); }
        .combined-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .combined-icon { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, var(--accent2), var(--accent)); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; box-shadow: 0 0 16px rgba(34,211,238,.35); }
        .combined-title { flex: 1; min-width: 0; }
        .combined-name { font-weight: 900; font-size: 15px; letter-spacing: .2px; }
        .combined-sub { font-size: 10px; color: var(--dim); margin-top: 2px; }
        .combined-badge { font-size: 9px; font-weight: 900; letter-spacing: .5px; padding: 3px 8px; border-radius: 6px; color: var(--accent2); background: rgba(34,211,238,.12); border: 1px solid rgba(34,211,238,.3); flex-shrink: 0; }
        .combined-stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 12px; }
        .combined-stats .cs-cell { background: rgba(255,255,255,.02); border: 1px solid var(--card-border); border-radius: 8px; padding: 8px 10px; min-width: 0; }
        .combined-stats .cs-cell.eggs { border-color: rgba(251,191,36,.25); background: rgba(251,191,36,.05); }
        .combined-stats .cs-label { font-size: 9px; font-weight: 800; color: var(--dim); text-transform: uppercase; letter-spacing: .3px; display: flex; align-items: center; gap: 4px; }
        .combined-stats .cs-value { font-size: 13px; font-weight: 900; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .combined-stats .cs-money .cs-value { color: var(--gold); }
        .combined-stats .cs-income .cs-value { color: var(--accent2); }
        .combined-stats .cs-speed .cs-value { color: var(--accent); }
        .combined-stats .cs-eggs .cs-value { color: var(--gold); }
        .combined-stats .cs-sub { font-size: 9px; color: var(--dim); margin-top: 1px; }
        .combined-toppets { border-top: 1px solid var(--card-border); padding-top: 10px; }
        .combined-toppets-label { font-size: 9px; font-weight: 800; color: var(--dim); text-transform: uppercase; letter-spacing: .3px; margin-bottom: 6px; }
        .combined-toppets-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
        .combined-chip { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .combined-chip-more { font-size: 10px; color: var(--dim); font-weight: 700; }
        @media (max-width: 900px) { .combined-stats { grid-template-columns: repeat(2, 1fr); } }

        .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 12px; margin-bottom: 10px; }
        .st .sl { font-size: 9px; font-weight: 800; color: var(--dim); letter-spacing: .3px; text-transform: uppercase; }
        .st .sv { font-size: 14px; font-weight: 800; }
        .st.speed .sv { color: var(--accent); }
        .st.money .sv { color: var(--gold); }
        .st.income .sv { color: var(--accent2); }

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
        .act-sell { background: var(--surface); color: var(--ink); border: 1px solid var(--card-border) !important; }
        .act-sell:hover { border-color: var(--accent2) !important; }
        .act-mod { background: var(--surface); color: #f59e0b; border: 1px solid var(--card-border) !important; }
        .act-mod:hover { border-color: #f59e0b !important; }
        .act-del { background: transparent; color: var(--red); border: 1px solid rgba(239,68,68,.3) !important; flex: 0; padding: 7px 10px; }
        .act-del:hover { background: rgba(239,68,68,.1); border-color: var(--red) !important; }
        .max-tag { font-size: 9px; font-weight: 900; color: #1a1030; background: linear-gradient(135deg, var(--gold), #f59e0b); padding: 1px 6px; border-radius: 4px; letter-spacing: .5px; vertical-align: middle; margin-left: 4px; display: inline-block; line-height: 1.4; }
        .genmsg { font-size: 10px; margin-top: 4px; min-height: 12px; }
        .empty { color: var(--dim); text-align: center; padding: 60px 0; font-size: 14px; }

        /* Delete confirm */
        .del-confirm { position: absolute; inset: 0; background: rgba(10,10,20,.95); border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; z-index: 5; }
        .del-confirm p { font-size: 13px; font-weight: 700; text-align: center; margin: 0; color: var(--ink); }
        .del-confirm .del-actions { display: flex; gap: 8px; }
        .del-confirm button { padding: 8px 20px; border-radius: 8px; font-size: 12px; font-weight: 800; cursor: pointer; border: none; }
        .del-yes { background: var(--red); color: #fff; }
        .del-no { background: var(--surface); color: var(--ink); border: 1px solid var(--card-border) !important; }

        /* ============ DETAIL MODAL ============ */
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.7); display: flex; align-items: flex-start; justify-content: center; padding: 30px 16px; overflow-y: auto; z-index: 50; backdrop-filter: blur(4px); }
        .modal { background: var(--bg); border: 1px solid var(--card-border); border-radius: 20px; width: 100%; max-width: 820px; overflow: hidden; }

        .modal-header { background: var(--card); padding: 20px 24px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--card-border); }
        .modal-header .mh-dot { width: 10px; height: 10px; border-radius: 50%; }
        .modal-header .mh-dot.on { background: var(--green); box-shadow: 0 0 10px var(--green); }
        .modal-header .mh-dot.off { background: var(--red); box-shadow: 0 0 8px rgba(239,68,68,.4); }
        .modal-header .mh-name { font-size: 20px; font-weight: 900; flex: 1; }
        .mh-badge { font-size: 10px; font-weight: 800; padding: 3px 10px; border-radius: 6px; letter-spacing: .5px; }
        .mh-badge.on { background: rgba(52,211,153,.15); color: var(--green); border: 1px solid rgba(52,211,153,.3); }
        .mh-badge.off { background: rgba(239,68,68,.12); color: var(--red); border: 1px solid rgba(239,68,68,.25); }
        .modal-close { background: none; border: none; color: var(--dim); font-size: 24px; cursor: pointer; line-height: 1; padding: 4px 8px; border-radius: 6px; }
        .modal-close:hover { color: var(--ink); background: var(--surface); }

        .modal-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; padding: 16px 24px; background: var(--card); border-bottom: 1px solid var(--card-border); }
        .ms-card { background: var(--surface); border: 1px solid var(--card-border); border-radius: 10px; padding: 10px 12px; }
        .ms-card .mslabel { font-size: 9px; font-weight: 800; color: var(--dim); letter-spacing: .5px; text-transform: uppercase; margin-bottom: 4px; }
        .ms-card .msval { font-size: 16px; font-weight: 900; }

        .modal-tabs { display: flex; gap: 0; padding: 0 24px; background: var(--card); border-bottom: 1px solid var(--card-border); }
        .mtab { padding: 12px 20px; font-size: 12px; font-weight: 800; letter-spacing: .3px; cursor: pointer; color: var(--dim); background: transparent; border: none; border-bottom: 2px solid transparent; transition: all .15s; }
        .mtab:hover { color: var(--ink); }
        .mtab.active { color: var(--accent2); border-bottom-color: var(--accent2); }

        .modal-body { padding: 20px 24px; max-height: 55vh; overflow-y: auto; }

        /* Pet grid in modal */
        .pet-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
        .pg-card { background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 10px; display: flex; align-items: center; gap: 10px; transition: border-color .15s; }
        .pg-card:hover { border-color: #333355; }
        .pg-info { flex: 1; min-width: 0; }
        .pg-name { font-size: 12px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pg-meta { display: flex; align-items: center; gap: 6px; margin-top: 3px; flex-wrap: wrap; }
        .pg-rate { font-size: 11px; font-weight: 800; color: var(--gold); }
        .pg-rarity { font-size: 8px; font-weight: 800; padding: 1px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: .3px; }
        .pg-mutation { font-size: 8px; font-weight: 800; border-radius: 3px; padding: 1px 5px; text-transform: uppercase; letter-spacing: .3px; border: 1px solid transparent; }
        .pg-mutation.mut-golden { color: #7c4a03; background: linear-gradient(135deg, #fde68a, #f59e0b); border-color: rgba(245,158,11,.5); text-shadow: 0 1px 0 rgba(255,255,255,.35); }
        .pg-mutation.mut-silver { color: #4b5563; background: linear-gradient(135deg, #f3f4f6, #cbd5e1); border-color: rgba(148,163,184,.5); text-shadow: 0 1px 0 rgba(255,255,255,.35); }
        .pg-mutation.mut-rainbow { color: #fff; background: linear-gradient(90deg, #ef4444, #f59e0b, #22d3ee, #22c55e, #a855f7); border-color: rgba(255,255,255,.2); text-shadow: 0 1px 2px rgba(0,0,0,.4); }
        .pg-mutation.mut-fractured { color: #fff; background: linear-gradient(135deg, #1a1030, #6d28d9); border-color: rgba(139,92,246,.5); text-shadow: 0 1px 2px rgba(0,0,0,.4); }
        .pg-mutation.mut-boss { color: #fff; background: linear-gradient(135deg, #7f1d1d, #b91c1c); border-color: rgba(239,68,68,.4); }
        .pg-mutation.mut-sakura { color: #831843; background: linear-gradient(135deg, #fbcfe8, #f472b6); border-color: rgba(244,114,182,.4); }
        .pg-mutation.mut-frozen { color: #0c4a6e; background: linear-gradient(135deg, #bae6fd, #38bdf8); border-color: rgba(56,189,248,.4); text-shadow: 0 1px 0 rgba(255,255,255,.35); }
        .pg-mutation.mut-magma { color: #fff; background: linear-gradient(135deg, #ea580c, #dc2626); border-color: rgba(220,38,38,.5); text-shadow: 0 1px 2px rgba(0,0,0,.35); }
        .pg-mutation.mut-candy { color: #831843; background: linear-gradient(135deg, #fbcfe8, #fda4af, #fde68a); border-color: rgba(251,113,133,.4); }
        .pg-mutation.mut-shocked { color: #422006; background: linear-gradient(135deg, #fef08a, #facc15); border-color: rgba(234,179,8,.5); }
        .pg-mutation.mut-scared { color: #e5e7eb; background: linear-gradient(135deg, #1f2937, #4b5563); border-color: rgba(107,114,128,.4); }
        .pg-mutation.mut-alpha { color: #fff; background: linear-gradient(135deg, #4c1d95, #7c3aed); border-color: rgba(139,92,246,.5); text-shadow: 0 1px 2px rgba(0,0,0,.4); }
        .pg-mutation.mut-2x { color: #fff; background: linear-gradient(135deg, #b45309, #f97316); border-color: rgba(249,115,22,.5); text-shadow: 0 1px 2px rgba(0,0,0,.3); }
        .pg-mutation.mut-default { color: #c4b5fd; background: rgba(167,139,250,.1); border-color: rgba(167,139,250,.25); }
        .pg-weight { font-size: 9px; color: var(--dim); }
        .pg-weight-inline { font-size: 10px; color: var(--dim); background: rgba(148,163,184,.08); border: 1px solid rgba(148,163,184,.18); border-radius: 4px; padding: 1px 5px; }

        /* Redesigned card badges (rarity top-right + BAG/EQUIPPED, plus UID footer) */
        .pg-card { position: relative; padding: 14px; align-items: flex-start; }
        .pg-badges { position: absolute; top: 8px; right: 8px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; z-index: 1; pointer-events: none; }
        .pg-badge-rarity { font-size: 8px; font-weight: 900; padding: 3px 7px; border-radius: 5px; letter-spacing: .4px; text-transform: uppercase; }
        .pg-badge-role { font-size: 8px; font-weight: 900; padding: 2px 6px; border-radius: 4px; letter-spacing: .3px; }
        .pg-badge-role.equipped { background: rgba(34,211,238,.15); color: var(--accent2); border: 1px solid rgba(34,211,238,.4); }
        .pg-badge-role.bag { background: rgba(251,191,36,.12); color: var(--gold); border: 1px solid rgba(251,191,36,.3); }
        .pg-uid { font-size: 9px; color: var(--dim); margin-top: 6px; font-family: ui-monospace, monospace; letter-spacing: .3px; }
        .pg-from { font-size: 9px; color: var(--accent2); margin-top: 3px; font-weight: 700; background: rgba(34,211,238,0.1); padding: 1px 6px; border-radius: 4px; display: inline-block; }

        /* Rarity chip filter row above the grid */
        .rarity-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 24px 0; background: var(--card); }
        .rchip { font-size: 10px; font-weight: 800; padding: 5px 10px; border-radius: 20px; background: var(--surface); color: var(--dim); border: 1px solid var(--card-border); cursor: pointer; text-transform: uppercase; letter-spacing: .3px; transition: all .12s; display: inline-flex; align-items: center; gap: 5px; }
        .rchip:hover { border-color: var(--accent2); color: var(--ink); }
        .rchip.active { background: rgba(34,211,238,.15); color: var(--accent2); border-color: rgba(34,211,238,.4); }
        .rchip-count { background: rgba(255,255,255,.06); color: inherit; border-radius: 8px; padding: 0 5px; font-weight: 900; font-size: 9px; }

        /* Value bar showing the aggregate $/s for currently-filtered items */
        .value-bar { padding: 8px 24px 0; background: var(--card); font-size: 11px; font-weight: 900; color: var(--gold); letter-spacing: .3px; }
        .section-label { font-size: 11px; font-weight: 800; color: var(--dim); letter-spacing: .5px; margin-bottom: 8px; padding-top: 4px; }

        /* Growing egg card */
        .egg-card { background: var(--card); border: 1px solid rgba(52,211,153,.2); border-radius: 12px; padding: 12px; display: flex; align-items: center; gap: 12px; }
        .egg-card.ready { border-color: var(--gold); background: linear-gradient(135deg, rgba(251,191,36,.05), var(--card)); }
        .egg-timer-ring { width: 44px; height: 44px; border-radius: 50%; position: relative; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .egg-timer-ring svg { position: absolute; inset: 0; transform: rotate(-90deg); }
        .egg-timer-ring .etr-text { font-size: 9px; font-weight: 900; z-index: 1; }
        .egg-info { flex: 1; min-width: 0; }
        .egg-name { font-size: 12px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .egg-sub { display: flex; align-items: center; gap: 6px; margin-top: 3px; }
        .egg-rate { font-size: 11px; font-weight: 800; color: var(--gold); }
        .egg-time-label { font-size: 11px; font-weight: 700; }
        .egg-ready-badge { font-size: 9px; font-weight: 800; color: var(--gold); background: rgba(251,191,36,.15); border: 1px solid rgba(251,191,36,.3); padding: 2px 8px; border-radius: 4px; }

        .detail-empty { color: var(--dim); font-size: 13px; padding: 20px 0; text-align: center; }

        /* ============ ALL ACCOUNTS DETAIL MODAL ============ */
        .modal.modal-wide { max-width: 1100px; }
        .modal-header .mh-sub { font-size: 11px; color: var(--dim); margin-top: 2px; }
        .modal-header .mh-title-block { flex: 1; min-width: 0; }
        .aa-search { display: flex; align-items: center; gap: 8px; padding: 12px 24px; background: var(--card); border-bottom: 1px solid var(--card-border); }
        .aa-search input { flex: 1; background: var(--surface); color: var(--ink); border: 1px solid var(--card-border); border-radius: 8px; padding: 8px 12px; font-size: 12px; font-weight: 600; }
        .aa-search input:focus { outline: none; border-color: var(--accent2); }
        .aa-search .aa-count { font-size: 11px; font-weight: 800; color: var(--dim); letter-spacing: .3px; }
        .aa-accounts { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
        .aa-row { background: var(--card); border: 1px solid var(--card-border); border-radius: 10px; padding: 10px 12px; cursor: pointer; transition: all .15s; }
        .aa-row:hover { border-color: var(--accent2); transform: translateY(-1px); }
        .aa-row-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .aa-row-name { font-size: 13px; font-weight: 800; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .aa-row-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
        .aa-row-stat { min-width: 0; }
        .aa-row-stat .l { font-size: 8px; font-weight: 800; color: var(--dim); letter-spacing: .3px; text-transform: uppercase; }
        .aa-row-stat .v { font-size: 11px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .aa-row-stat.money .v { color: var(--gold); }
        .aa-row-stat.income .v { color: var(--accent2); }
        .aa-row-stat.speed .v { color: var(--accent); }
        .aa-loading-note { font-size: 10px; color: var(--dim); padding: 6px 24px 0; background: var(--card); font-style: italic; }
      `}</style>

      <div className="dash">
        <div className="header">
          <div className="header-left">
            <div className="eyebrow">STEAL AN EGG</div>
            <h1>Monitor Dashboard</h1>
          </div>
          <div className="conn-badge">
            <span className="cdot" />
            {allOnline.length} / {filtered.length} Online
          </div>
        </div>

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

        <div className="toolbar">
          <div className="tabs">
            <button className={`tab ${tabMode === "all" ? "active" : ""}`} onClick={() => setTabMode("all")}>ALL <span className="tcount">{filtered.length}</span></button>
            <button className={`tab online-tab ${tabMode === "online" ? "active" : ""}`} onClick={() => setTabMode("online")}>ONLINE <span className="tcount">{allOnline.length}</span></button>
            <button className={`tab offline-tab ${tabMode === "offline" ? "active" : ""}`} onClick={() => setTabMode("offline")}>OFFLINE <span className="tcount">{allOffline.length}</span></button>
          </div>
          <div className="tool-sep" />
          <label>Sort:</label>
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
            <option value="name_asc">Nama (Nomor)</option>
            <option value="speed_desc">Speed Tertinggi</option>
            <option value="income_aktif_desc">Income Aktif Tertinggi</option>
            <option value="income_potensi_desc">Income Potensi Tertinggi</option>
            <option value="egg_desc">Egg Terbanyak</option>
            <option value="work">Work (Potensi Tertinggi)</option>
          </select>
          <label>Device:</label>
          <input type="text" placeholder="cth: 1SAE141" value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)} />
          <button className="genallbtn" disabled={genAllRunning || allOnline.length === 0} onClick={generateAll}>Generate All Poster</button>
          {genAllStatus && <span className="genallstatus">{genAllStatus}</span>}
        </div>

        {displayed.length === 0 ? (
          <div className="empty">
            {accounts.length > 0
              ? tabMode === "offline" ? "Tidak ada akun offline saat ini."
              : tabMode === "online" ? "Tidak ada akun online saat ini."
              : "Ga ada akun yang cocok sama filter itu."
              : 'Belum ada akun yang lapor. Nyalain "Auto Report ke Dashboard" di GUI game.'}
          </div>
        ) : (
          <div className="grid">
            <AllAccountsCard accounts={displayed} tabMode={tabMode} onOpen={() => openAllDetail(displayed)} />
            {displayed.map((a) => (
              <AccountCard
                key={a.sourceAccount}
                account={a}
                onOpen={openDetail}
                onSell={markForSale}
                onModerated={markModerated}
                onDelete={(name) => setDeleteConfirm(name)}
                deleteConfirm={deleteConfirm}
                onDeleteConfirm={deleteAccount}
                onDeleteCancel={() => setDeleteConfirm(null)}
                genMsg={genMsgs.current[a.sourceAccount]}
                maxKandang={maxKandang}
                maxTreadmill={maxTreadmill}
                deviceMap={deviceMap}
              />
            ))}
          </div>
        )}

        {/* ===== DETAIL MODAL ===== */}
        {detail && (
          <div className="overlay" onClick={(e) => { if ((e.target as HTMLElement).classList.contains("overlay")) setDetail(null); }}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <DetailModal
                detail={detail}
                detailTab={detailTab}
                setDetailTab={setDetailTab}
                onClose={() => setDetail(null)}
                maxKandang={maxKandang}
                maxTreadmill={maxTreadmill}
              />
            </div>
          </div>
        )}

        {/* ===== ALL ACCOUNTS DETAIL MODAL ===== */}
        {allDetail && (
          <div className="overlay" onClick={(e) => { if ((e.target as HTMLElement).classList.contains("overlay")) setAllDetail(null); }}>
            <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
              <AllAccountsDetailModal
                allDetail={allDetail}
                tab={allDetailTab}
                setTab={setAllDetailTab}
                onClose={() => setAllDetail(null)}
                onOpenAccount={(name) => { setAllDetail(null); openDetail(name); }}
                deviceMap={deviceMap}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ===== ACCOUNT CARD ===== */
function AccountCard({ account: a, onOpen, onSell, onModerated, onDelete, deleteConfirm, onDeleteConfirm, onDeleteCancel, genMsg, maxKandang, maxTreadmill, deviceMap }: {
  account: Account;
  onOpen: (name: string) => void;
  onSell: (name: string) => void;
  onModerated: (name: string) => void;
  onDelete: (name: string) => void;
  deleteConfirm: string | null;
  onDeleteConfirm: (name: string) => void;
  onDeleteCancel: () => void;
  genMsg?: { text: string; color: string };
  maxKandang: number;
  maxTreadmill: number;
  deviceMap: Record<string, string>;
}) {
  const isOff = !a.online;
  const eggCount = a.growingEggCount || 0;
  const eggCap = 20;
  const eggPct = Math.min(100, Math.round((eggCount / eggCap) * 100));
  const showDeleteConfirm = deleteConfirm === a.sourceAccount;

  return (
    <div className={`card ${isOff ? "is-offline" : ""}`} onClick={() => onOpen(a.sourceAccount)}>
      {showDeleteConfirm && (
        <div className="del-confirm" onClick={(e) => e.stopPropagation()}>
          <p>Hapus {a.sourceAccount}<br/>dari dashboard?</p>
          <div className="del-actions">
            <button className="del-yes" onClick={() => onDeleteConfirm(a.sourceAccount)}>Hapus</button>
            <button className="del-no" onClick={onDeleteCancel}>Batal</button>
          </div>
        </div>
      )}
      <div className="card-top">
        <span className={`status-dot ${isOff ? "off" : "on"}`} />
        <span className="acc-name">{a.sourceAccount}</span>
        {deviceLabel(a.deviceId, deviceMap) && <span className="dev-tag">{deviceLabel(a.deviceId, deviceMap)}</span>}
        <span className={`time-tag ${isOff ? "off" : "on"}`}>
          {isOff ? fmtLastSeen(a.lastSeen) : fmtUptime(a.firstSeen) || "Active"}
        </span>
      </div>
      <div className="stats">
        <div className="st speed"><div className="sl">SPEED</div><div className="sv">{fmtCompactNum(a.speed)}</div></div>
        <div className="st money"><div className="sl">CASH</div><div className="sv">{fmtMoney(a.money)}</div></div>
        <div className="st income"><div className="sl">INCOME AKTIF</div><div className="sv">{fmtRate(a.incomeAktif)}</div></div>
        <div className="st income"><div className="sl">INCOME POTENSI</div><div className="sv">{fmtRate(a.incomePotensi)}</div></div>
        <div className="st"><div className="sl">PEN &amp; TM</div><div className="sv">{(() => { const k = fmtLevelMax(a.kandangLevel, maxKandang); const t = fmtLevelMax(a.treadmillLevel, maxTreadmill); return <>{k.isMax ? <><span>{fmtLevel(a.kandangLevel)}</span> <span className="max-tag">MAX</span></> : fmtLevel(a.kandangLevel)} &amp; {t.isMax ? <><span>{fmtLevel(a.treadmillLevel)}</span> <span className="max-tag">MAX</span></> : fmtLevel(a.treadmillLevel)}</>; })()}</div></div>
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
      <div className="card-actions">
        <a className="act-btn act-poster" href={`/poster?account=${encodeURIComponent(a.sourceAccount)}`} onClick={(e) => e.stopPropagation()}>Poster</a>
        <button className="act-btn act-sell" onClick={(e) => { e.stopPropagation(); onSell(a.sourceAccount); }}>Siap Jual</button>
        <button className="act-btn act-mod" onClick={(e) => { e.stopPropagation(); onModerated(a.sourceAccount); }}>Moderated</button>
        {isOff && (
          <button className="act-btn act-del" onClick={(e) => { e.stopPropagation(); onDelete(a.sourceAccount); }} title="Hapus akun">&#x2715;</button>
        )}
      </div>
      <div className="genmsg" style={{ color: genMsg?.color || "var(--dim)" }}>{genMsg?.text || ""}</div>
    </div>
  );
}

/* ===== ALL ACCOUNTS COMBINED CARD =====
 * Sits as the first tile in the grid, aggregating the currently-displayed
 * accounts (respects the Online/Offline/All tab + device filter). Clicking
 * opens the combined detail modal.
 */
function AllAccountsCard({ accounts, tabMode, onOpen }: { accounts: Account[]; tabMode: TabMode; onOpen: () => void }) {
  const [idx, setIdx] = useState<Record<string, string>>({});
  useEffect(() => { loadIconIndex().then(setIdx); }, []);

  const totalCount = accounts.length;
  const onlineCount = accounts.reduce((n, a) => n + (a.online ? 1 : 0), 0);
  const money = accounts.reduce((s, a) => s + (Number(a.money) || 0), 0);
  const income = accounts.reduce((s, a) => s + (Number(a.incomeAktif) || 0), 0);
  const speed = accounts.reduce((s, a) => s + (Number(a.speed) || 0), 0);
  const pets = accounts.reduce((s, a) => s + (Number(a.petsCount) || 0), 0);
  const eggBackpackCount = accounts.reduce((s, a) => s + (Number(a.backpackEggCount) || 0), 0);
  const eggGrowingCount = accounts.reduce((s, a) => s + (Number(a.growingEggCount) || 0), 0);
  const eggs = eggBackpackCount + eggGrowingCount;
  const eggIncome = accounts.reduce(
    (s, a) => s + (Number(a.incomeEggBackpack) || 0) + (Number(a.incomeEggSedangTumbuh) || 0),
    0
  );

  // Merge topPets across accounts, sort by rate desc, keep the top 3 for
  // preview and count the rest so we can show "+N more".
  const allTopPets: Pet[] = [];
  for (const a of accounts) {
    for (const p of (a.topPets || [])) allTopPets.push(p);
  }
  allTopPets.sort((a, b) => (b.rate || 0) - (a.rate || 0));
  const previewPets = allTopPets.slice(0, 3);
  const moreCount = Math.max(0, allTopPets.length - previewPets.length);

  const subLabel = tabMode === "online"
    ? `${totalCount} Online`
    : tabMode === "offline"
    ? `${totalCount} Offline`
    : `${onlineCount} / ${totalCount} Online`;

  return (
    <div className="card combined" onClick={onOpen}>
      <div className="combined-head">
        <div className="combined-icon">👥</div>
        <div className="combined-title">
          <div className="combined-name">All Accounts</div>
          <div className="combined-sub">{subLabel}</div>
        </div>
        <span className="combined-badge">COMBINED</span>
      </div>

      <div className="combined-stats">
        <div className="cs-cell cs-money">
          <div className="cs-label">💵 MONEY</div>
          <div className="cs-value">{fmtMoney(money)}</div>
        </div>
        <div className="cs-cell cs-income">
          <div className="cs-label">⚡ INCOME / SEC</div>
          <div className="cs-value">{fmtRate(income)}</div>
        </div>
        <div className="cs-cell cs-speed">
          <div className="cs-label">🏃 SPEED</div>
          <div className="cs-value">{fmtCompactNum(speed)}</div>
        </div>
        <div className="cs-cell">
          <div className="cs-label">🐾 PETS</div>
          <div className="cs-value">{fmtNum(pets)}</div>
        </div>
        <div className="cs-cell cs-eggs eggs">
          <div className="cs-label">🥚 TOTAL EGGS</div>
          <div className="cs-value">{fmtNum(eggs)}</div>
          {eggIncome > 0 && <div className="cs-sub">{fmtRate(eggIncome)}</div>}
        </div>
      </div>

      {previewPets.length > 0 && (
        <div className="combined-toppets">
          <div className="combined-toppets-label">TOP PETS</div>
          <div className="combined-toppets-chips">
            {previewPets.map((p, i) => {
              const rar = petRarity(p.category, idx);
              const rc = rarityColor(rar);
              return (
                <span
                  key={i}
                  className="combined-chip"
                  style={{ background: rc + "18", color: rc, border: `1px solid ${rc}33` }}
                  title={`${p.name || p.category} — ${fmtRate(p.rate || 0)}`}
                >
                  <PetIcon category={p.category} name={p.name || p.category} size={16} />
                  {p.name || p.category}
                </span>
              );
            })}
            {moreCount > 0 && <span className="combined-chip-more">+{moreCount} more</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== DETAIL MODAL =====
 * Redesign per SS reference:
 *  - PETS: activePets + allPets (dedup by uid). EQUIPPED badge on active ones.
 *  - EGGS: growingEggs (timer ring) + backpackEggs (BAG badge).
 *  - STOLEN / TOOLS: driven by fields the in-game script may or may not send;
 *    modal shows an empty state until those payloads land.
 */
function DetailModal({ detail, detailTab, setDetailTab, onClose, maxKandang, maxTreadmill }: {
  detail: { name: string; data: AccountDetail | null; loading: boolean; account: Account | null };
  detailTab: DetailTab;
  setDetailTab: (t: DetailTab) => void;
  onClose: () => void;
  maxKandang: number;
  maxTreadmill: number;
}) {
  const [idx, setIdx] = useState<Record<string, string>>({});
  useEffect(() => { loadIconIndex().then(setIdx); }, []);
  const [rarityFilter, setRarityFilter] = useState<string>("ALL");

  // Reset the rarity chip whenever the user switches tabs -- otherwise a chip
  // that had a count on tab A can leave the grid empty on tab B.
  useEffect(() => { setRarityFilter("ALL"); }, [detailTab]);

  const acc = detail.account;
  const isOnline = acc?.online ?? false;

  // Merge active + all pets, dedup by uid (activePets are typically also in
  // allPets on the game side, so listing them twice would double-count).
  const petsForTab = (): (Pet & { _equipped?: boolean; _bag?: boolean })[] => {
    if (!detail.data) return [];
    if (detailTab === "pets") {
      const activeUids = new Set((detail.data.activePets || []).map((p) => p.uid).filter(Boolean));
      const merged: (Pet & { _equipped?: boolean; _bag?: boolean })[] = [];
      for (const p of (detail.data.activePets || [])) merged.push({ ...p, _equipped: true });
      for (const p of (detail.data.allPets || [])) {
        if (p.uid && activeUids.has(p.uid)) continue;
        merged.push({ ...p, _bag: true });
      }
      return merged;
    }
    if (detailTab === "eggs") {
      const merged: (Pet & { _equipped?: boolean; _bag?: boolean })[] = [];
      for (const e of (detail.data.growingEggs || [])) merged.push(e);
      for (const e of (detail.data.backpackEggs || [])) merged.push({ ...e, _bag: true });
      return merged;
    }
    return [];
  };
  const allItems = petsForTab();

  // Count per rarity, driven by the icon index (same lookup PetGrid uses).
  const rarityCounts: Record<string, number> = { ALL: allItems.length };
  const RARITY_ORDER = ["Eternal", "Divine", "Secret", "Cosmic", "Mythic", "Legendary", "Epic", "Rare", "Uncommon", "Common"];
  for (const p of allItems) {
    const r = petRarity(p.category, idx) || "Unknown";
    rarityCounts[r] = (rarityCounts[r] || 0) + 1;
  }
  const rarityOptions = ["ALL", ...RARITY_ORDER.filter((r) => rarityCounts[r] > 0)];
  if (rarityCounts["Unknown"] > 0) rarityOptions.push("Unknown");

  const filteredItems = rarityFilter === "ALL"
    ? allItems
    : allItems.filter((p) => (petRarity(p.category, idx) || "Unknown") === rarityFilter);

  const totalValueRate = filteredItems.reduce((s, p) => s + (Number(p.rate) || 0), 0);

  const petCount = (detail.data?.activePets?.length ?? 0) + (detail.data?.allPets?.length ?? 0)
    - (detail.data?.activePets?.filter((p) => p.uid && (detail.data?.allPets || []).some((a) => a.uid === p.uid)).length ?? 0);
  const eggCount = (detail.data?.growingEggs?.length ?? 0) + (detail.data?.backpackEggs?.length ?? 0);
  const stolenCount = detail.data?.stolenItems?.length ?? 0;
  const toolsCount = detail.data?.tools?.length ?? 0;

  return (
    <>
      <div className="modal-header">
        <span className={`mh-dot ${isOnline ? "on" : "off"}`} />
        <span className="mh-name">{detail.name}</span>
        <span className={`mh-badge ${isOnline ? "on" : "off"}`}>{isOnline ? "ONLINE" : "OFFLINE"}</span>
        <button className="modal-close" onClick={onClose}>&times;</button>
      </div>

      {detail.loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--dim)" }}>Memuat data...</div>
      ) : !detail.data ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--dim)" }}>Belum ada data lengkap buat akun ini.</div>
      ) : (
        <>
          {/* Stats bar */}
          {acc && (
            <div className="modal-stats">
              <div className="ms-card">
                <div className="mslabel">CASH</div>
                <div className="msval" style={{ color: "var(--gold)" }}>{fmtMoney(acc.money)}</div>
              </div>
              <div className="ms-card">
                <div className="mslabel">INCOME AKTIF</div>
                <div className="msval" style={{ color: "var(--accent2)" }}>{fmtRate(
                  detail.data?.activePets
                    ? detail.data.activePets.reduce((s: number, p: Pet) => s + (p.rate || 0), 0)
                    : acc.incomeAktif
                )}</div>
              </div>
              <div className="ms-card">
                <div className="mslabel">SPEED</div>
                <div className="msval" style={{ color: "var(--accent)" }}>{fmtCompactNum(acc.speed)}</div>
              </div>
              <div className="ms-card">
                <div className="mslabel">KANDANG</div>
                <div className="msval">{fmtLevelMax(acc.kandangLevel, maxKandang).isMax ? <>{fmtLevel(acc.kandangLevel)} <span className="max-tag">MAX</span></> : fmtLevel(acc.kandangLevel)}</div>
              </div>
              <div className="ms-card">
                <div className="mslabel">TREADMILL</div>
                <div className="msval">{fmtLevelMax(acc.treadmillLevel, maxTreadmill).isMax ? <>{fmtLevel(acc.treadmillLevel)} <span className="max-tag">MAX</span></> : fmtLevel(acc.treadmillLevel)}</div>
              </div>
              <div className="ms-card">
                <div className="mslabel">ACTIVE LIMIT</div>
                <div className="msval">{detail.data.activeLimit ?? "-"}</div>
              </div>
              <div className="ms-card">
                <div className="mslabel">INCOME POTENSI</div>
                <div className="msval" style={{ color: "var(--green)" }}>{fmtRate(
                  (() => {
                    if (!detail.data) return 0;
                    const limit = detail.data.activeLimit || 19;
                    const all = [
                      ...(detail.data.activePets || []),
                      ...(detail.data.allPets || []),
                      ...(detail.data.growingEggs || []),
                      ...(detail.data.backpackEggs || []),
                    ];
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
                  })()
                )}</div>
              </div>
              <div className="ms-card">
                <div className="mslabel">TOKEN MUTASI</div>
                <div className="msval" style={{ color: "#a78bfa" }}>{fmtNum(acc.mutationToken ?? 0)}</div>
              </div>
              <div className="ms-card">
                <div className="mslabel">TOKEN SCRAMBLE</div>
                <div className="msval" style={{ color: "var(--green)" }}>{acc.scrambleToken != null ? fmtNum(acc.scrambleToken) : "—"}</div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="modal-tabs">
            <button className={`mtab ${detailTab === "pets" ? "active" : ""}`} onClick={() => setDetailTab("pets")}>
              🐾 PETS ({petCount})
            </button>
            <button className={`mtab ${detailTab === "eggs" ? "active" : ""}`} onClick={() => setDetailTab("eggs")} style={(detail.data.growingEggs?.length ?? 0) > 0 ? { color: "var(--green)" } : undefined}>
              🥚 EGGS ({eggCount})
            </button>
            <button className={`mtab ${detailTab === "stolen" ? "active" : ""}`} onClick={() => setDetailTab("stolen")}>
              🎯 STOLEN ({stolenCount})
            </button>
            <button className={`mtab ${detailTab === "tools" ? "active" : ""}`} onClick={() => setDetailTab("tools")}>
              🛠️ TOOLS ({toolsCount})
            </button>
          </div>

          {/* Rarity chip row + value bar */}
          {(detailTab === "pets" || detailTab === "eggs") && allItems.length > 0 && (
            <>
              <div className="rarity-chips">
                {rarityOptions.map((r) => {
                  const isActive = rarityFilter === r;
                  const rc = r === "ALL" ? "var(--accent2)" : rarityColor(r);
                  return (
                    <button
                      key={r}
                      className={`rchip ${isActive ? "active" : ""}`}
                      onClick={() => setRarityFilter(r)}
                      style={isActive ? { borderColor: rc, color: rc, background: rc + "18" } : undefined}
                    >
                      {r.toUpperCase()} <span className="rchip-count">{rarityCounts[r] || 0}</span>
                    </button>
                  );
                })}
              </div>
              <div className="value-bar">VALUE: {fmtRate(totalValueRate)}</div>
            </>
          )}

          {/* Content */}
          <div className="modal-body">
            {detailTab === "pets" && <PetGrid pets={filteredItems as Pet[]} idx={idx} showBadges />}
            {detailTab === "eggs" && (
              <>
                {(detail.data.growingEggs?.length ?? 0) > 0 && (
                  <GrowingEggGrid eggs={detail.data.growingEggs.filter((e) => rarityFilter === "ALL" || (petRarity(e.category, idx) || "Unknown") === rarityFilter)} idx={idx} />
                )}
                {(detail.data.backpackEggs?.length ?? 0) > 0 && (
                  <PetGrid pets={detail.data.backpackEggs.filter((e) => rarityFilter === "ALL" || (petRarity(e.category, idx) || "Unknown") === rarityFilter).map((e) => ({ ...e, _bag: true } as any))} idx={idx} showBadges />
                )}
                {(detail.data.growingEggs?.length ?? 0) === 0 && (detail.data.backpackEggs?.length ?? 0) === 0 && (
                  <div className="detail-empty">Belum ada telur.</div>
                )}
              </>
            )}
            {detailTab === "stolen" && (
              stolenCount === 0
                ? <div className="detail-empty">Belum ada pet stolen ke-tracking. Fitur ini nunggu game-side ngirim data <code>stolenItems</code>.</div>
                : <PetGrid pets={(detail.data.stolenItems || []) as unknown as Pet[]} idx={idx} showBadges />
            )}
            {detailTab === "tools" && (
              toolsCount === 0
                ? <div className="detail-empty">Belum ada tool ke-tracking. Fitur ini nunggu game-side ngirim data <code>tools</code>.</div>
                : (
                  <div className="pet-grid">
                    {(detail.data.tools || []).map((t, i) => (
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
      )}
    </>
  );
}

/* ===== ALL ACCOUNTS DETAIL MODAL ===== */
function AllAccountsDetailModal({ allDetail, tab, setTab, onClose, onOpenAccount, deviceMap }: {
  allDetail: { accounts: Account[]; details: Record<string, AccountDetail>; loading: boolean };
  tab: AllDetailTab;
  setTab: (t: AllDetailTab) => void;
  onClose: () => void;
  onOpenAccount: (name: string) => void;
  deviceMap: Record<string, string>;
}) {
  const [idx, setIdx] = useState<Record<string, string>>({});
  useEffect(() => { loadIconIndex().then(setIdx); }, []);
  const [rarityFilter, setRarityFilter] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  useEffect(() => { setRarityFilter("ALL"); }, [tab]);

  const { accounts, details, loading } = allDetail;
  const totalCount = accounts.length;
  const onlineCount = accounts.reduce((n, a) => n + (a.online ? 1 : 0), 0);
  const money = accounts.reduce((s, a) => s + (Number(a.money) || 0), 0);
  const income = accounts.reduce((s, a) => s + (Number(a.incomeAktif) || 0), 0);
  const speed = accounts.reduce((s, a) => s + (Number(a.speed) || 0), 0);

  // Aggregate items across all fetched details. Pets merge active + bag with
  // uid dedup (same rule as per-account DetailModal). Eggs keep the growing /
  // backpack split. Stolen and tools are flat lists.
  const allPets: (Pet & { _equipped?: boolean; _bag?: boolean; _from?: string })[] = [];
  const allGrowingEggs: (Pet & { _from?: string })[] = [];
  const allBackpackEggs: (Pet & { _from?: string })[] = [];
  const allStolen: (StolenItem & { _from?: string })[] = [];
  const allTools: (ToolItem & { _from?: string })[] = [];
  for (const a of accounts) {
    const d = details[a.sourceAccount];
    if (!d) continue;
    const activeUids = new Set((d.activePets || []).map((p) => p.uid).filter(Boolean));
    for (const p of (d.activePets || [])) allPets.push({ ...p, _equipped: true, _from: a.sourceAccount });
    for (const p of (d.allPets || [])) {
      if (p.uid && activeUids.has(p.uid)) continue;
      allPets.push({ ...p, _bag: true, _from: a.sourceAccount });
    }
    for (const e of (d.growingEggs || [])) allGrowingEggs.push({ ...e, _from: a.sourceAccount });
    for (const e of (d.backpackEggs || [])) allBackpackEggs.push({ ...e, _from: a.sourceAccount });
    for (const s of (d.stolenItems || [])) allStolen.push({ ...s, _from: a.sourceAccount });
    for (const t of (d.tools || [])) allTools.push({ ...t, _from: a.sourceAccount });
  }
  const petCount = allPets.length;
  const eggCount = allGrowingEggs.length + allBackpackEggs.length;
  const stolenCount = allStolen.length;
  const toolsCount = allTools.length;

  const currentItems: Pet[] =
    tab === "pets" ? (allPets as Pet[]) :
    tab === "eggs" ? ([...allGrowingEggs, ...allBackpackEggs.map((e) => ({ ...e, _bag: true }))] as Pet[]) :
    [];

  const rarityCounts: Record<string, number> = { ALL: currentItems.length };
  const RARITY_ORDER = ["Eternal", "Divine", "Secret", "Cosmic", "Mythic", "Legendary", "Epic", "Rare", "Uncommon", "Common"];
  for (const p of currentItems) {
    const r = petRarity(p.category, idx) || "Unknown";
    rarityCounts[r] = (rarityCounts[r] || 0) + 1;
  }
  const rarityOptions = ["ALL", ...RARITY_ORDER.filter((r) => rarityCounts[r] > 0)];
  if (rarityCounts["Unknown"] > 0) rarityOptions.push("Unknown");
  const filteredItems = rarityFilter === "ALL"
    ? currentItems
    : currentItems.filter((p) => (petRarity(p.category, idx) || "Unknown") === rarityFilter);
  const totalValueRate = filteredItems.reduce((s, p) => s + (Number(p.rate) || 0), 0);

  const q = query.trim().toLowerCase();
  const filteredAccounts = q
    ? accounts.filter((a) => a.sourceAccount.toLowerCase().includes(q))
    : accounts;

  const doneCount = accounts.reduce((n, a) => n + (details[a.sourceAccount] ? 1 : 0), 0);

  return (
    <>
      <div className="modal-header">
        <div className="combined-icon" style={{ width: 36, height: 36, fontSize: 18 }}>👥</div>
        <div className="mh-title-block">
          <div className="mh-name">All Accounts</div>
          <div className="mh-sub">Combined Telemetry · {totalCount} Connected Accounts</div>
        </div>
        <span className="mh-badge on">{onlineCount} / {totalCount} ONLINE</span>
        <button className="modal-close" onClick={onClose}>&times;</button>
      </div>

      <div className="modal-stats">
        <div className="ms-card">
          <div className="mslabel">TOTAL MONEY</div>
          <div className="msval" style={{ color: "var(--gold)" }}>{fmtMoney(money)}</div>
        </div>
        <div className="ms-card">
          <div className="mslabel">TOTAL INCOME</div>
          <div className="msval" style={{ color: "var(--accent2)" }}>{fmtRate(income)}</div>
        </div>
        <div className="ms-card">
          <div className="mslabel">TOTAL SPEED</div>
          <div className="msval" style={{ color: "var(--accent)" }}>{fmtCompactNum(speed)}</div>
        </div>
        <div className="ms-card">
          <div className="mslabel">INVENTORY</div>
          <div className="msval">{fmtNum(petCount || accounts.reduce((s, a) => s + (Number(a.petsCount) || 0), 0))} pets · {fmtNum(eggCount)} eggs</div>
        </div>
      </div>

      <div className="modal-tabs">
        <button className={`mtab ${tab === "accounts" ? "active" : ""}`} onClick={() => setTab("accounts")}>👥 ACCOUNTS ({totalCount})</button>
        <button className={`mtab ${tab === "pets" ? "active" : ""}`} onClick={() => setTab("pets")}>🐾 PETS ({petCount})</button>
        <button className={`mtab ${tab === "eggs" ? "active" : ""}`} onClick={() => setTab("eggs")}>🥚 EGGS ({eggCount})</button>
        <button className={`mtab ${tab === "stolen" ? "active" : ""}`} onClick={() => setTab("stolen")}>🎯 STOLEN ({stolenCount})</button>
        <button className={`mtab ${tab === "tools" ? "active" : ""}`} onClick={() => setTab("tools")}>🛠️ TOOLS ({toolsCount})</button>
        <button className={`mtab ${tab === "work" ? "active" : ""}`} onClick={() => setTab("work")}>⚡ WORK</button>
      </div>

      {loading && (
        <div className="aa-loading-note">Memuat detail {doneCount}/{totalCount}...</div>
      )}

      {tab === "accounts" && (
        <div className="aa-search">
          <input placeholder="Cari akun..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <span className="aa-count">{filteredAccounts.length} / {totalCount}</span>
        </div>
      )}

      {(tab === "pets" || tab === "eggs") && filteredItems.length > 0 && (
        <>
          <div className="rarity-chips">
            {rarityOptions.map((r) => {
              const isActive = rarityFilter === r;
              const rc = r === "ALL" ? "var(--accent2)" : rarityColor(r);
              return (
                <button
                  key={r}
                  className={`rchip ${isActive ? "active" : ""}`}
                  onClick={() => setRarityFilter(r)}
                  style={isActive ? { borderColor: rc, color: rc, background: rc + "18" } : undefined}
                >
                  {r.toUpperCase()} <span className="rchip-count">{rarityCounts[r] || 0}</span>
                </button>
              );
            })}
          </div>
          <div className="value-bar">VALUE: {fmtRate(totalValueRate)}</div>
        </>
      )}

      <div className="modal-body">
        {tab === "accounts" && (
          filteredAccounts.length === 0
            ? <div className="detail-empty">Ga ada akun yang cocok.</div>
            : (
              <div className="aa-accounts">
                {filteredAccounts.map((a) => (
                  <div key={a.sourceAccount} className="aa-row" onClick={() => onOpenAccount(a.sourceAccount)}>
                    <div className="aa-row-head">
                      <span className={`status-dot ${a.online ? "on" : "off"}`} />
                      <span className="aa-row-name">{a.sourceAccount}</span>
                      {deviceLabel(a.deviceId, deviceMap) && <span className="dev-tag">{deviceLabel(a.deviceId, deviceMap)}</span>}
                    </div>
                    <div className="aa-row-stats">
                      <div className="aa-row-stat money"><div className="l">CASH</div><div className="v">{fmtMoney(a.money)}</div></div>
                      <div className="aa-row-stat income"><div className="l">INCOME</div><div className="v">{fmtRate(a.incomeAktif)}</div></div>
                      <div className="aa-row-stat speed"><div className="l">SPEED</div><div className="v">{fmtCompactNum(a.speed)}</div></div>
                    </div>
                  </div>
                ))}
              </div>
            )
        )}

        {tab === "pets" && (
          petCount === 0
            ? <div className="detail-empty">{loading ? "Memuat..." : "Belum ada pet ke-tracking."}</div>
            : <PetGrid pets={filteredItems as Pet[]} idx={idx} showBadges />
        )}

        {tab === "eggs" && (
          eggCount === 0
            ? <div className="detail-empty">{loading ? "Memuat..." : "Belum ada telur."}</div>
            : (
              <>
                {allGrowingEggs.length > 0 && (
                  <>
                    <div className="section-label">🥚 GROWING EGGS ({allGrowingEggs.filter((e) => rarityFilter === "ALL" || (petRarity(e.category, idx) || "Unknown") === rarityFilter).length})</div>
                    <GrowingEggGrid eggs={allGrowingEggs.filter((e) => rarityFilter === "ALL" || (petRarity(e.category, idx) || "Unknown") === rarityFilter)} idx={idx} />
                  </>
                )}
                {allBackpackEggs.length > 0 && (
                  <>
                    <div className="section-label" style={{ marginTop: 16 }}>🎒 BACKPACK EGGS ({allBackpackEggs.filter((e) => rarityFilter === "ALL" || (petRarity(e.category, idx) || "Unknown") === rarityFilter).length})</div>
                    <PetGrid pets={allBackpackEggs.filter((e) => rarityFilter === "ALL" || (petRarity(e.category, idx) || "Unknown") === rarityFilter).map((e) => ({ ...e, _bag: true } as any))} idx={idx} showBadges />
                  </>
                )}
              </>
            )
        )}

        {tab === "stolen" && (
          stolenCount === 0
            ? <div className="detail-empty">{loading ? "Memuat..." : "Belum ada pet stolen ke-tracking."}</div>
            : <PetGrid pets={allStolen as unknown as Pet[]} idx={idx} showBadges />
        )}

        {tab === "tools" && (
          toolsCount === 0
            ? <div className="detail-empty">{loading ? "Memuat..." : "Belum ada tool ke-tracking."}</div>
            : (
              <div className="pet-grid">
                {allTools.map((t, i) => (
                  <div key={i} className="pg-card">
                    <div className="pg-info">
                      <div className="pg-name">{t.name || t.category || "Tool"}</div>
                      <div className="pg-meta">
                        {t.itemType && <span className="pg-rarity" style={{ background: "rgba(148,163,184,.15)", color: "var(--dim)", border: "1px solid rgba(148,163,184,.3)" }}>{t.itemType}</span>}
                        {t.count != null && <span className="pg-rate">×{t.count}</span>}
                        {t._from && <span className="pg-weight-inline">{t._from}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
        )}

        {tab === "work" && (() => {
          const WORK_THRESHOLD = 20_000_000_000;
          const WORK_PET_CATEGORIES = new Set(["Skeleton Horse", "Pegasus", "Arch Angel", "World Burner"]);
          const workGrowing = allGrowingEggs.filter((e) => (e.rate || 0) >= WORK_THRESHOLD);
          const workBackpack = allBackpackEggs.filter((e) => (e.rate || 0) >= WORK_THRESHOLD);
          const workPets = (allPets as (Pet & { _equipped?: boolean; _bag?: boolean; _from?: string })[])
            .filter((p) => WORK_PET_CATEGORIES.has(p.category) || WORK_PET_CATEGORIES.has(p.name || ""))
            .sort((a, b) => (b.rate || 0) - (a.rate || 0));
          const workEggTotal = workGrowing.length + workBackpack.length;
          const workAllTotal = workEggTotal + workPets.length;
          const workValue = [...workGrowing, ...workBackpack, ...workPets].reduce((s, e) => s + (e.rate || 0), 0);
          return workAllTotal === 0
            ? <div className="detail-empty">{loading ? "Memuat..." : "Tidak ada item yang masuk kriteria."}</div>
            : (
              <>
                <div className="value-bar">TOTAL: {workAllTotal} items · VALUE: {fmtRate(workValue)}</div>
                {workPets.length > 0 && (
                  <>
                    <div className="section-label">🐾 KEY PETS ({workPets.length})</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
                      {workPets.map((p, i) => {
                        const rar = petRarity(p.category, idx);
                        const rc = rarityColor(rar);
                        return (
                          <div key={i} className="egg-card">
                            <PetIcon category={p.category} name={p.name || p.category} size={36} />
                            <div className="egg-info">
                              <div className="egg-name">{p.name || p.category}</div>
                              <div className="egg-sub">
                                <span className="egg-rate">{fmtRate(p.rate)}</span>
                                {rar && <span className="pg-rarity" style={{ background: rc + "18", color: rc, border: `1px solid ${rc}33` }}>{rar}</span>}
                                {(Array.isArray(p.mutations) ? p.mutations : []).map((m, j) => <span key={j} className={mutationClass(m)}>{m}</span>)}
                              </div>
                              <div style={{ marginTop: 3, display: "flex", gap: 6, alignItems: "center" }}>
                                {p._equipped && <span className="pg-badge-role equipped">EQUIPPED</span>}
                                {p._bag && !p._equipped && <span className="pg-badge-role bag">BAG</span>}
                                {p._from && <span className="pg-from" style={{ marginTop: 0 }}>{p._from}</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
                {workGrowing.length > 0 && (
                  <>
                    <div className="section-label" style={{ marginTop: 16 }}>🌱 GROWING EGGS &ge; 20B ({workGrowing.length})</div>
                    <GrowingEggGrid eggs={workGrowing} idx={idx} />
                  </>
                )}
                {workBackpack.length > 0 && (
                  <>
                    <div className="section-label" style={{ marginTop: 16 }}>🎒 BACKPACK EGGS &ge; 20B ({workBackpack.length})</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
                      {[...workBackpack].sort((a, b) => (b.rate || 0) - (a.rate || 0)).map((egg, i) => {
                        const rar = petRarity(egg.category, idx);
                        const rc = rarityColor(rar);
                        return (
                          <div key={i} className="egg-card">
                            <PetIcon category={egg.category} name={egg.name || egg.category} size={36} />
                            <div className="egg-info">
                              <div className="egg-name">{egg.name || egg.category}</div>
                              <div className="egg-sub">
                                <span className="egg-rate">{fmtRate(egg.rate)}</span>
                                {rar && <span className="pg-rarity" style={{ background: rc + "18", color: rc, border: `1px solid ${rc}33` }}>{rar}</span>}
                                {(Array.isArray(egg.mutations) ? egg.mutations : []).map((m, j) => <span key={j} className={mutationClass(m)}>{m}</span>)}
                              </div>
                              <div style={{ marginTop: 3, display: "flex", gap: 6, alignItems: "center" }}>
                                <span className="pg-badge-role bag">DI TAS</span>
                                {egg._from && <span className="pg-from" style={{ marginTop: 0 }}>{egg._from}</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            );
        })()}
      </div>
    </>
  );
}

/* ===== PET GRID (detail modal) ===== */
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
                {(Array.isArray(p.mutations) ? p.mutations : []).map((m, j) => <span key={j} className={mutationClass(m)}>{m}</span>)}
              </div>
              {showBadges && p.uid && <div className="pg-uid">UID: {String(p.uid).slice(0, 8)}</div>}
              {p._from && <div className="pg-from">{p._from}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ===== GROWING EGG GRID ===== */
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
                {(Array.isArray(egg.mutations) ? egg.mutations : []).map((m, j) => <span key={j} className={mutationClass(m)}>{m}</span>)}
              </div>
              <div style={{ marginTop: 3, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {isReady ? (
                  <span className="egg-ready-badge">SIAP MENETAS</span>
                ) : (
                  <span className="egg-time-label" style={{ color: "var(--green)" }}>{fmtEggTimer(remaining)} tersisa</span>
                )}
                {egg._from && <span className="pg-from" style={{ marginTop: 0 }}>{egg._from}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ===== PET CARDS (dashboard card mini) ===== */
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
