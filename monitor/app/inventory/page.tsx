"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface Unit {
  id?: string | null;
  name: string;
  rarity: string;
  displayRarity?: string | null;
  variant: string | null;
  mutation: string | null;
  level: number | null;
  amount: number;
  trait?: string | null;
  grade?: string | null;
  locked?: boolean | null;
  income?: number | null;
  damage?: number | null;
  chance?: number | null;
  health?: number | null;
  placed?: "slot" | "tower" | null;
  image?: number | string | null;
}

interface BackpackItem {
  name: string;
  amount: number;
  kind: string;
  rarity: string;
  slot?: string | null;
  tier?: string | number | null;
  image?: number | string | null;
}

interface ADDetail {
  ownedDice: string[];
  upgrades: Record<string, number>;
  gamepasses: Record<string, boolean>;
  topUnits: Unit[];
  allUnits: Unit[];
  backpack: BackpackItem[];
  slots: any[];
  towerSquad: { squad: any[]; equipped: any | null };
  upgradesList: string[];
  unitsCount: number;
  unitTypesCount: number;
  discoveredCount: number;
  slotsCount: number;
  totalItemCount: number;
}

interface Rates {
  gemRate: number;
  traitRerollRate: number;
  luckySpinRate: number;
  jackpotRate: number;
  gearRate: number;
  gearSetRate: number;
  unitRateLow: number;   // Rp per 1sx of chance, applied to units < 10sx chance
  unitRateHigh: number;  // Rp per 1sx of chance, applied to units >= 10sx chance
}

interface UnitState { price: number; sold: boolean }

interface SewaEntry { pricePerHour: number; deposit: number }

interface InventoryState {
  unitData: Record<string, UnitState>;
  bpSold: Record<string, number>;
  sewa: Record<string, SewaEntry>;
}

const DEFAULT_RATES: Rates = {
  gemRate: 0,
  traitRerollRate: 0,
  luckySpinRate: 0,
  jackpotRate: 0,
  gearRate: 0,
  gearSetRate: 0,
  unitRateLow: 0,
  unitRateHigh: 0,
};

const DEFAULT_ACCOUNT = "KaijuBer2"; // initial pick when nothing else is cached
const SELECTED_ACCOUNT_KEY = "ad-inv-selected-account";
const ALL_ACCOUNTS = "__ALL__"; // sentinel: aggregate across every catalog push
const MIN_CHANCE = 1e21; // 1 in 1sx and above only

const RARITY_COLORS: Record<string, string> = {
  Exclusive: "#ff6b6b",
  "Secret II": "#ff4ecf",
  Heavenly: "#ff4ecf",
  "Secret I": "#ff7eb3",
  Celestial: "#ff7eb3",
  Exotic: "#f472b6",
  Divine: "#e879f9",
  Mythical: "#a78bfa",
  Legendary: "#fbbf24",
  Epic: "#818cf8",
  Rare: "#34d399",
  Uncommon: "#94a3b8",
  Common: "#71717a",
};

const RARITY_ORDER = [
  "Exclusive", "Secret II", "Heavenly", "Secret I", "Celestial",
  "Exotic", "Divine", "Mythical", "Legendary", "Epic", "Rare", "Uncommon", "Common",
];

function rarityColor(r: string): string { return RARITY_COLORS[r] || "#71717a"; }

// Mutation-aware display mapping. Game promotes Secret I → Heavenly when the
// unit carries a top-tier mutation (Emerald/Diamond/Ruby/Rainbow). Prefer
// Luau-provided displayRarity when present.
const RARITY_DISPLAY: Record<string, string> = {
  "Secret I": "Celestial",
  "Secret II": "Heavenly",
};
const PROMOTING_MUTATIONS = new Set(["Emerald", "Diamond", "Ruby", "Rainbow"]);
function rarityDisplayFor(u: { rarity: string; mutation?: string | null; displayRarity?: string | null }): string {
  if (u.displayRarity) return u.displayRarity;
  if (u.rarity === "Secret I" && u.mutation && PROMOTING_MUTATIONS.has(u.mutation)) return "Heavenly";
  return RARITY_DISPLAY[u.rarity] || u.rarity;
}
function rarityDisplay(r: string): string { return RARITY_DISPLAY[r] || r; }

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "-";
  const n = Number(v);
  const abs = Math.abs(n);
  if (abs >= 1e30) return (n / 1e30).toFixed(2) + "no";
  if (abs >= 1e27) return (n / 1e27).toFixed(2) + "oc";
  if (abs >= 1e24) return (n / 1e24).toFixed(2) + "sp";
  if (abs >= 1e21) return (n / 1e21).toFixed(2) + "sx";
  if (abs >= 1e18) return (n / 1e18).toFixed(2) + "qi";
  if (abs >= 1e15) return (n / 1e15).toFixed(2) + "qa";
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "t";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "b";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "m";
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + "k";
  return n.toFixed(0);
}

function fmtNum(v: number | null | undefined): string {
  if (v == null) return "-";
  return Number(v).toLocaleString("en-US");
}

function fmtRp(v: number): string {
  if (!v) return "Rp 0";
  return "Rp " + Math.round(v).toLocaleString("id-ID");
}

function unitKey(u: Unit): string {
  if (u.id) return "id:" + u.id;
  return [u.name, u.variant || "", u.rarity, u.mutation || "", u.trait || "", u.grade || "", u.level ?? ""].join("|");
}

const UNIT_RATE_THRESHOLD = 1e22; // 10sx

function autoUnitPrice(u: Unit, rates: Rates): number {
  const c = Number(u.chance) || 0;
  if (c <= 0) return 0;
  const rate = c >= UNIT_RATE_THRESHOLD ? rates.unitRateHigh : rates.unitRateLow;
  if (!rate) return 0;
  return (c / 1e21) * rate; // chance converted to "sx units" × rate
}

type ViewTab = "unit" | "backpack";

const GEAR_SLOTS = ["Head", "Torso", "Back", "Upper", "Waist"];

function gearSlotFromName(name: string): string | null {
  const n = name.toLowerCase();
  // Head: mask, helmet, hat, fan (e.g. Obita's War Fan, Obito Mask)
  if (n.includes("mask") || n.includes("helmet") || n.includes("hat") || n.includes("fan") || n.includes("head")) return "Head";
  // Torso: coat, robe, shirt, chest, armor (e.g. Mazun's Coat, Jogu's Robe)
  if (n.includes("coat") || n.includes("robe") || n.includes("shirt") || n.includes("chest") || n.includes("armor") || n.includes("torso")) return "Torso";
  // Back: drum, cape, wing (e.g. Enol's Drums)
  if (n.includes("drum") || n.includes("cape") || n.includes("wing") || n.includes("back")) return "Back";
  // Upper: halo, sword, arm, shoulder (e.g. Angel's Halo, Zaro's Swords)
  if (n.includes("halo") || n.includes("sword") || n.includes("arm") || n.includes("shoulder") || n.includes("upper")) return "Upper";
  // Waist: sash, belt, pants, leg (e.g. Sakuna's Sash)
  if (n.includes("sash") || n.includes("belt") || n.includes("pants") || n.includes("leg") || n.includes("waist")) return "Waist";
  return null;
}

function gearSlot(item: BackpackItem): string | null {
  if (item.slot) {
    const s = item.slot.toLowerCase();
    for (const canon of GEAR_SLOTS) {
      if (s.includes(canon.toLowerCase())) return canon;
    }
  }
  return gearSlotFromName(item.name);
}

export default function InventoryPage() {
  const [mounted, setMounted] = useState(false);
  const [detail, setDetail] = useState<ADDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<Rates>(DEFAULT_RATES);
  const [state, setState] = useState<InventoryState>({ unitData: {}, bpSold: {}, sewa: {} });
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set());
  const [sewaModalOpen, setSewaModalOpen] = useState(false);
  const [sewaInputs, setSewaInputs] = useState<Record<string, { pricePerHour: string; deposit: string }>>({});
  const [tab, setTab] = useState<ViewTab>("unit");
  const [search, setSearch] = useState("");
  const [rarityFilter, setRarityFilter] = useState("All");
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [soldUnitsOpen, setSoldUnitsOpen] = useState(false);
  const [soldItemsOpen, setSoldItemsOpen] = useState(false);
  const [bpSoldModal, setBpSoldModal] = useState<string | null>(null);
  const [bpSoldInput, setBpSoldInput] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<string>(DEFAULT_ACCOUNT);
  const [accounts, setAccounts] = useState<string[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // List of accounts that have pushed via AnimeDiceSell.luau. User picks
  // from the dropdown — no auto-switch. "All Accounts" aggregates them.
  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/anime-dice/catalog");
      const body = await res.json();
      if (res.ok && body.ok && Array.isArray(body.snapshots)) {
        const names = body.snapshots
          .map((s: any) => s.sourceAccount)
          .filter((n: any) => typeof n === "string" && n.length > 0) as string[];
        names.sort((a, b) => a.localeCompare(b));
        setAccounts(names);
      }
    } catch {}
  }, []);

  function changeAccount(name: string) {
    setSelectedAccount(name);
    try { localStorage.setItem(SELECTED_ACCOUNT_KEY, name); } catch {}
  }

  const fetchData = useCallback(async () => {
    if (!selectedAccount) return;
    try {
      const [ratesRes, stateRes] = await Promise.all([
        fetch("/api/anime-dice/inventory-rates"),
        fetch("/api/anime-dice/inventory-state"),
      ]);
      const rBody = await ratesRes.json();
      const sBody = await stateRes.json();
      if (ratesRes.ok && rBody.ok && rBody.rates) setRates({ ...DEFAULT_RATES, ...rBody.rates });
      if (stateRes.ok && sBody.ok && sBody.state) setState({ unitData: sBody.state.unitData || {}, bpSold: sBody.state.bpSold || {}, sewa: sBody.state.sewa || {} });

      if (selectedAccount === ALL_ACCOUNTS) {
        // Aggregate every account's catalog snapshot into one virtual inventory
        const res = await fetch("/api/anime-dice/catalog");
        const body = await res.json();
        if (res.ok && body.ok && Array.isArray(body.snapshots)) {
          const allU: any[] = [];
          const bpMap = new Map<string, any>();
          body.snapshots.forEach((snap: any) => {
            const us = Array.isArray(snap.units) ? snap.units : [];
            us.forEach((u: any) => allU.push(u));
            const bp = Array.isArray(snap.backpack) ? snap.backpack : [];
            bp.forEach((it: any) => {
              const key = (it.name || "").toLowerCase();
              const prev = bpMap.get(key);
              if (prev) prev.amount = (prev.amount || 0) + (it.amount || 0);
              else bpMap.set(key, { ...it });
            });
          });
          setDetail({
            ownedDice: [], upgrades: {}, gamepasses: {}, topUnits: [],
            allUnits: allU, backpack: Array.from(bpMap.values()),
            slots: [], towerSquad: { squad: [], equipped: null }, upgradesList: [],
            unitsCount: allU.length, unitTypesCount: allU.length,
            discoveredCount: 0, slotsCount: 0,
            totalItemCount: Array.from(bpMap.values()).reduce((s, b) => s + (b.amount || 0), 0),
          } as ADDetail);
        } else {
          setDetail(null);
        }
      } else {
        const detailRes = await fetch("/api/anime-dice/account-detail?account=" + encodeURIComponent(selectedAccount));
        const dBody = await detailRes.json();
        if (detailRes.ok && dBody.ok) setDetail(dBody); else setDetail(null);
      }
    } catch {}
    setLoading(false);
  }, [selectedAccount]);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(SELECTED_ACCOUNT_KEY);
      if (saved) setSelectedAccount(saved);
    } catch {}
    fetchAccounts();
  }, [fetchAccounts]);
  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 15000);
    return () => clearInterval(id);
  }, [fetchData]);
  // Keep the account list fresh so new executors show up in the dropdown
  useEffect(() => {
    const id = setInterval(fetchAccounts, 30000);
    return () => clearInterval(id);
  }, [fetchAccounts]);
  useEffect(() => {
    setSelectedUnits(new Set());
    setDetail(null);
    setLoading(true);
  }, [selectedAccount]);

  function saveRates(next: Rates) {
    setRates(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/anime-dice/inventory-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rates: next }),
      }).catch(() => {});
    }, 600);
  }

  // User input × 100 = rupiah. 1 = Rp 100, 10 = Rp 1,000, 13 = Rp 1,300.
  function updateRate(key: keyof Rates, val: string) {
    const n = parseFloat(val);
    const rupiah = Number.isFinite(n) ? n * 100 : 0;
    saveRates({ ...rates, [key]: rupiah });
  }

  function saveState(next: InventoryState) {
    setState(next);
    fetch("/api/anime-dice/inventory-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => {});
  }

  function toggleUnitSold(key: string) {
    const cur = state.unitData[key] || { price: 0, sold: false };
    const next = { ...state, unitData: { ...state.unitData, [key]: { ...cur, sold: !cur.sold } } };
    saveState(next);
  }

  function setUnitPrice(key: string, val: string) {
    const num = parseFloat(val.replace(/[.,]/g, "")) || 0;
    const cur = state.unitData[key] || { price: 0, sold: false };
    const next = { ...state, unitData: { ...state.unitData, [key]: { ...cur, price: num } } };
    setState(next);
    if (priceTimers.current[key]) clearTimeout(priceTimers.current[key]);
    priceTimers.current[key] = setTimeout(() => {
      fetch("/api/anime-dice/inventory-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      }).catch(() => {});
    }, 600);
  }

  function confirmBpSold() {
    if (!bpSoldModal) return;
    const qty = parseFloat(bpSoldInput.replace(/[.,]/g, "")) || 0;
    const next = { ...state, bpSold: { ...state.bpSold, [`${selectedAccount}:${bpSoldModal}`]: qty } };
    saveState(next);
    setBpSoldModal(null);
    setBpSoldInput("");
  }

  function toggleSelect(key: string) {
    setSelectedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function openSewaModal() {
    const inputs: Record<string, { pricePerHour: string; deposit: string }> = {};
    selectedUnits.forEach((k) => {
      const existing = state.sewa[k];
      inputs[k] = {
        pricePerHour: existing?.pricePerHour ? String(existing.pricePerHour) : "",
        deposit: existing?.deposit ? String(existing.deposit) : "",
      };
    });
    setSewaInputs(inputs);
    setSewaModalOpen(true);
  }

  function confirmSewa() {
    const nextSewa = { ...state.sewa };
    Object.entries(sewaInputs).forEach(([k, v]) => {
      const pph = parseFloat(v.pricePerHour.replace(/[.,]/g, "")) || 0;
      const dep = parseFloat(v.deposit.replace(/[.,]/g, "")) || 0;
      if (pph > 0 || dep > 0) {
        nextSewa[k] = { pricePerHour: pph, deposit: dep };
      } else {
        delete nextSewa[k];
      }
    });
    saveState({ ...state, sewa: nextSewa });
    setSewaModalOpen(false);
    setSelectedUnits(new Set());
  }

  function removeSewa(key: string) {
    const nextSewa = { ...state.sewa };
    delete nextSewa[key];
    saveState({ ...state, sewa: nextSewa });
  }

  if (!mounted) return null;

  const rawUnits = (detail?.allUnits || []).filter((u) => u.chance != null && u.chance >= MIN_CHANCE);
  const sortedUnits = [...rawUnits].sort((a, b) => {
    const ra = RARITY_ORDER.indexOf(rarityDisplayFor(a));
    const rb = RARITY_ORDER.indexOf(rarityDisplayFor(b));
    if (ra !== rb) return (ra === -1 ? 999 : ra) - (rb === -1 ? 999 : rb);
    return (b.chance || 0) - (a.chance || 0);
  });

  const filteredUnits = sortedUnits.filter((u) => {
    if (rarityFilter !== "All" && rarityDisplayFor(u) !== rarityFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const full = ((u.variant || "") + " " + u.name + " " + (u.trait || "") + " " + (u.grade || "")).toLowerCase();
      if (!full.includes(q) && !u.rarity.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const availableRarities = Array.from(new Set(sortedUnits.map((u) => rarityDisplayFor(u))));

  const backpack = detail?.backpack || [];
  const gems = backpack.find((b) => b.name.toLowerCase().includes("gem"));
  const traitReroll = backpack.find((b) => b.name.toLowerCase().includes("trait reroll"));
  const luckySpin = backpack.find((b) => b.name.toLowerCase().includes("lucky spin"));
  const jackpot = backpack.find((b) => b.name.toLowerCase().includes("jackpot"));

  const gearItems = backpack.filter((b) => {
    const k = (b.kind || "").toLowerCase();
    const n = b.name.toLowerCase();
    return k.includes("gear") || k === "equipment" || !!b.slot || gearSlotFromName(b.name) !== null;
  });

  const divineGearCount = gearItems
    .filter((g) => g.rarity?.toLowerCase() === "divine")
    .reduce((s, g) => s + (g.amount || 0), 0);

  // Calculate values per item type: (available qty × rate)
  function itemValue(item: BackpackItem | undefined, soldKey: string, rate: number, divisor: number = 1): { availQty: number; soldQty: number; availVal: number; soldVal: number } {
    const total = item?.amount || 0;
    const sold = state.bpSold[`${selectedAccount}:${soldKey}`] || 0;
    const avail = Math.max(0, total - sold);
    return {
      availQty: avail,
      soldQty: sold,
      availVal: (avail / divisor) * rate,
      soldVal: (sold / divisor) * rate,
    };
  }

  const gemsV = itemValue(gems, "gems", rates.gemRate, 1000);
  const traitV = itemValue(traitReroll, "traitReroll", rates.traitRerollRate, 1000);
  const luckyV = itemValue(luckySpin, "luckySpin", rates.luckySpinRate);
  const jackpotV = itemValue(jackpot, "jackpot", rates.jackpotRate);

  // Gear: track total divine gears sold under single key (per account).
  // Available = total - sold. Full sets computed from available per-slot
  // (assuming uniform distribution of sold across slots).
  const GEAR_SLOT_LIST = ["Head", "Torso", "Back", "Upper", "Waist"];
  const totalDivineSold = state.bpSold[`${selectedAccount}:gear:divine`] || 0;
  const availDivineGear = Math.max(0, divineGearCount - totalDivineSold);

  // Per-slot divine count (from backpack items filtered by slot)
  const divinePerSlot: Record<string, number> = { Head: 0, Torso: 0, Back: 0, Upper: 0, Waist: 0 };
  gearItems.filter((g) => g.rarity?.toLowerCase() === "divine").forEach((g) => {
    const s = gearSlot(g);
    if (s && divinePerSlot[s] !== undefined) divinePerSlot[s] += (g.amount || 0);
  });
  // How many complete sets we can form from AVAILABLE divine gear.
  // Scale per-slot counts proportionally to availDivineGear vs total.
  const scaleFactor = divineGearCount > 0 ? availDivineGear / divineGearCount : 0;
  const availPerSlot = GEAR_SLOT_LIST.map((s) => Math.floor(divinePerSlot[s] * scaleFactor));
  const fullSets = availPerSlot.length > 0 ? Math.min(...availPerSlot) : 0;
  const leftoverDivine = Math.max(0, availDivineGear - fullSets * GEAR_SLOT_LIST.length);

  const setValue = fullSets * rates.gearSetRate;
  const leftoverValue = leftoverDivine * rates.gearRate;
  const availGearVal = setValue + leftoverValue;
  const soldGearVal = totalDivineSold * rates.gearRate;

  // Price per unit: prefer manual override, else auto-compute from rate × chance
  const unitPrice = (u: Unit): number => {
    const s = state.unitData[unitKey(u)];
    if (s?.price) return s.price;
    return autoUnitPrice(u, rates);
  };

  // Fleet estimasi (available)
  const estimasi = gemsV.availVal + traitV.availVal + luckyV.availVal + jackpotV.availVal + availGearVal
    + sortedUnits.reduce((s, u) => {
        const st = state.unitData[unitKey(u)];
        return s + (st?.sold ? 0 : unitPrice(u));
      }, 0);

  const terjual = gemsV.soldVal + traitV.soldVal + luckyV.soldVal + jackpotV.soldVal + soldGearVal
    + sortedUnits.reduce((s, u) => {
        const st = state.unitData[unitKey(u)];
        return s + (st?.sold ? unitPrice(u) : 0);
      }, 0);

  const soldUnitsList = sortedUnits.filter((u) => state.unitData[unitKey(u)]?.sold);
  const soldItemsList = [
    { name: "Gems", qty: gemsV.soldQty, val: gemsV.soldVal, key: "gems" },
    { name: "Trait Reroll", qty: traitV.soldQty, val: traitV.soldVal, key: "traitReroll" },
    { name: "Lucky Spin", qty: luckyV.soldQty, val: luckyV.soldVal, key: "luckySpin" },
    { name: "Jackpot Point", qty: jackpotV.soldQty, val: jackpotV.soldVal, key: "jackpot" },
    { name: "Divine Gear", qty: totalDivineSold, val: soldGearVal, key: "gear:divine" },
  ].filter((x) => x.qty > 0);

  const totalItemsRp = gemsV.availVal + traitV.availVal + luckyV.availVal + jackpotV.availVal;
  const totalGearsRp = availGearVal;

  function downloadSummary() {
    const lines: string[] = [];
    lines.push(`NARUHUB — INVENTORY SUMMARY (${selectedAccount})`);
    lines.push(`Generated: ${new Date().toLocaleString("id-ID")}`);
    lines.push("");
    lines.push(`ESTIMASI (Tersedia): ${fmtRp(estimasi)}`);
    lines.push(`TERJUAL: ${fmtRp(terjual)}`);
    lines.push("");
    lines.push("=== UNITS (1 in 1sx+) ===");
    sortedUnits.forEach((u) => {
      const s = state.unitData[unitKey(u)];
      const status = s?.sold ? "TERJUAL" : "TERSEDIA";
      const price = s?.price || 0;
      const full = (u.variant ? u.variant + " " : "") + u.name;
      lines.push(`- ${full} [${u.rarity}] | Grade: ${u.grade || "-"} | Trait: ${u.trait || "-"} | 1 in ${fmtMoney(u.chance)} | Lv ${u.level || "-"} | ${fmtMoney(u.income)}/s | ${status} | ${fmtRp(price)}`);
    });
    lines.push("");
    lines.push("=== BACKPACK ITEMS ===");
    lines.push(`Gems:         Avail ${fmtNum(gemsV.availQty)} (${fmtRp(gemsV.availVal)}) | Terjual ${fmtNum(gemsV.soldQty)} (${fmtRp(gemsV.soldVal)})`);
    lines.push(`Trait Reroll: Avail ${fmtNum(traitV.availQty)} (${fmtRp(traitV.availVal)}) | Terjual ${fmtNum(traitV.soldQty)} (${fmtRp(traitV.soldVal)})`);
    lines.push(`Lucky Spin:   Avail ${fmtNum(luckyV.availQty)} (${fmtRp(luckyV.availVal)}) | Terjual ${fmtNum(luckyV.soldQty)} (${fmtRp(luckyV.soldVal)})`);
    lines.push(`Jackpot:      Avail ${fmtNum(jackpotV.availQty)} (${fmtRp(jackpotV.availVal)}) | Terjual ${fmtNum(jackpotV.soldQty)} (${fmtRp(jackpotV.soldVal)})`);
    lines.push("");
    lines.push("=== GEAR ===");
    gearItems.forEach((g) => {
      const sold = state.bpSold[`${selectedAccount}:gear:${g.name}`] || 0;
      lines.push(`- ${g.name} [${g.rarity}] | Total ${g.amount} | Terjual ${sold}`);
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-${selectedAccount}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <style>{styles}</style>

      <div className="inv-wrap">
        {/* Top stats bar */}
        <div className="topbar">
          <div className="tb-stats">
            <div className="tb-stat estimasi">
              <div className="tbs-label">ESTIMASI</div>
              <div className="tbs-value">{fmtRp(estimasi)}</div>
            </div>
            <div className="tb-stat terjual">
              <div className="tbs-label">TERJUAL</div>
              <div className="tbs-value">{fmtRp(terjual)}</div>
            </div>
            <button className="tb-stat clickable unit-terjual" onClick={() => setSoldUnitsOpen(true)}>
              <div className="tbs-label">UNIT TERJUAL</div>
              <div className="tbs-value cyan">{soldUnitsList.length}</div>
              <div className="tbs-hint">klik lihat detail</div>
            </button>
            <button className="tb-stat clickable items-terjual" onClick={() => setSoldItemsOpen(true)}>
              <div className="tbs-label">ITEMS TERJUAL</div>
              <div className="tbs-value cyan">{soldItemsList.length}</div>
              <div className="tbs-hint">klik lihat detail</div>
            </button>
          </div>
          <div className="tb-actions">
            <a className="tba-btn" href="/inventory/rangkuman" target="_blank" rel="noopener">&#x1F4C4; Rangkuman Poster</a>
            <button className="tba-btn" onClick={downloadSummary}>&#x2B07; Download .txt</button>
            <button className="tba-btn primary" onClick={() => setRateModalOpen(true)}>&#x2699;&#xFE0F; Set Rate</button>
          </div>
        </div>

        <div className="body">
          {/* Left panel */}
          <aside className="side-panel">
            <div className="sp-title">PANEL</div>
            <div className="sp-account">
              <div className="sp-avatar">{selectedAccount === ALL_ACCOUNTS ? "✦" : (selectedAccount || "?")[0]?.toUpperCase()}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="sp-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selectedAccount === ALL_ACCOUNTS ? "All Accounts" : selectedAccount}
                </div>
                <div className="sp-sub">{selectedAccount === ALL_ACCOUNTS ? `Gabungan ${accounts.length} akun` : "Stock Account"}</div>
              </div>
            </div>
            <div className="sp-section">
              <div className="sp-label">Pilih Akun ({accounts.length})</div>
              <select className="sp-input" value={selectedAccount} onChange={(e) => changeAccount(e.target.value)}>
                {!accounts.includes(selectedAccount) && (
                  <option value={selectedAccount}>{selectedAccount}</option>
                )}
                {accounts.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <button
                className="sp-input"
                onClick={() => fetchAccounts()}
                style={{ cursor: "pointer", background: "var(--surface)", color: "var(--ink)", fontWeight: 700, border: "1px solid #222240", textAlign: "center", marginTop: 6 }}
                title="Refresh daftar akun"
              >
                &#x21BB; Refresh List
              </button>
              <button
                className="sp-input"
                onClick={async () => {
                  if (!confirm("Hapus SEMUA tracking (prices, sewa, sold)? Rates tetap tersimpan. Catalog akun akan di-reset juga.")) return;
                  await Promise.all([
                    fetch("/api/anime-dice/inventory-state", { method: "DELETE" }).catch(() => {}),
                    fetch("/api/anime-dice/catalog", { method: "DELETE" }).catch(() => {}),
                  ]);
                  setState({ unitData: {}, bpSold: {}, sewa: {} });
                  setSelectedUnits(new Set());
                  await fetchAccounts();
                  await fetchData();
                }}
                style={{ cursor: "pointer", background: "rgba(239,68,68,.1)", color: "var(--red)", fontWeight: 700, border: "1px solid rgba(239,68,68,.3)", textAlign: "center", marginTop: 6 }}
                title="Reset semua tracking dan catalog"
              >
                &#x1F5D1; Clear Data (Fresh)
              </button>
              {accounts.length === 0 && (
                <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 6, lineHeight: 1.4 }}>
                  Belum ada akun lapor via <b>AnimeDiceSell.luau</b>
                </div>
              )}
            </div>
            <div className="sp-section">
              <div className="sp-label">Unit Filter</div>
              <input className="sp-input" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <select className="sp-input" value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value)}>
                <option value="All">All Rarities</option>
                {availableRarities.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="sp-section">
              <div className="sp-label">Summary</div>
              <div className="sp-row"><span>Total Unit (1sx+)</span><b>{sortedUnits.length}</b></div>
              <div className="sp-row"><span>Terjual</span><b className="cyan">{soldUnitsList.length}</b></div>
              <div className="sp-row"><span>Tersedia</span><b className="green">{sortedUnits.length - soldUnitsList.length}</b></div>
              <div className="sp-divider" />
              <div className="sp-row"><span>Gems</span><b>{fmtNum(gemsV.availQty)}</b></div>
              <div className="sp-row"><span>Trait Reroll</span><b>{fmtNum(traitV.availQty)}</b></div>
              <div className="sp-row"><span>Lucky Spin</span><b>{fmtNum(luckyV.availQty)}</b></div>
              <div className="sp-row"><span>Jackpot</span><b>{fmtNum(jackpotV.availQty)}</b></div>
              <div className="sp-row"><span>Divine Gear</span><b className="purple">{fmtNum(availDivineGear)}</b></div>
            </div>
          </aside>

          {/* Main content */}
          <div className="main">
            <div className="tab-row">
              <button className={`tabb ${tab === "unit" ? "active" : ""}`} onClick={() => setTab("unit")}>UNIT</button>
              <button className={`tabb ${tab === "backpack" ? "active" : ""}`} onClick={() => setTab("backpack")}>BACKPACK</button>
              {tab === "unit" && selectedUnits.size > 0 && (
                <>
                  <button className="tabb sewa-btn" onClick={openSewaModal}>
                    &#x1F511; UNIT SEWA ({selectedUnits.size})
                  </button>
                  <button className="tabb clear-btn" onClick={() => setSelectedUnits(new Set())}>
                    &#x2715; Clear
                  </button>
                </>
              )}
            </div>

            <div className="content-box">
              {loading ? (
                <div className="empty">Memuat data {selectedAccount === ALL_ACCOUNTS ? "semua akun" : selectedAccount}...</div>
              ) : !detail ? (
                <div className="empty">Belum ada data untuk {selectedAccount === ALL_ACCOUNTS ? "akun manapun" : selectedAccount}. Pastikan AnimeDiceSell.luau sudah di-exe.</div>
              ) : tab === "unit" ? (
                filteredUnits.length === 0 ? (
                  <div className="empty">Tidak ada unit 1 in 1sx+ yang cocok filter.</div>
                ) : (
                  <div className="ugrid">
                    {filteredUnits.map((u, i) => {
                      const key = unitKey(u);
                      const s = state.unitData[key] || { price: 0, sold: false };
                      const rc = rarityColor(rarityDisplayFor(u));
                      const isSewa = !!state.sewa[key];
                      const isSelected = selectedUnits.has(key);
                      return (
                        <div key={`${key}-${i}`} className={`ucard ${s.sold ? "sold" : ""} ${isSelected ? "selected" : ""} ${isSewa ? "sewa" : ""}`}>
                          <div className="ucard-name" style={{ borderColor: rc + "40" }}>
                            <input
                              type="checkbox"
                              className="ucard-check"
                              checked={isSelected}
                              onChange={() => toggleSelect(key)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            {u.variant ? `${u.variant} ` : ""}{u.name}
                            {isSewa && (
                              <span
                                className="ucard-sewa-badge"
                                title="Klik untuk hapus dari sewa"
                                onClick={(e) => { e.stopPropagation(); if (confirm(`Hapus "${u.name}" dari daftar sewa?`)) removeSewa(key); }}
                                style={{ cursor: "pointer" }}
                              >SEWA &#x2715;</span>
                            )}
                          </div>
                          <div className="ucard-gt">
                            <div className="ucgt">
                              <div className="ucgt-l">GRADE</div>
                              <div className="ucgt-v">{u.grade || "-"}</div>
                            </div>
                            <div className="ucgt">
                              <div className="ucgt-l">TRAITS</div>
                              <div className="ucgt-v">{u.trait || "-"}</div>
                            </div>
                          </div>
                          <div className="ucard-chance" style={{ background: rc + "10", borderColor: rc + "30", color: rc }}>
                            <div className="ucc-l">CHANCE</div>
                            <div className="ucc-v">1 in {fmtMoney(u.chance)}</div>
                          </div>
                          <div className="ucard-li">
                            <div className="ucli">
                              <div className="ucli-l">LEVEL</div>
                              <div className="ucli-v">{u.level ?? "-"}</div>
                            </div>
                            <div className="ucli">
                              <div className="ucli-l">INCOME</div>
                              <div className="ucli-v green">${fmtMoney(u.income)}/s</div>
                            </div>
                          </div>
                          <button className={`ucard-status ${s.sold ? "sold" : "avail"}`} onClick={() => toggleUnitSold(key)}>
                            {s.sold ? "TERJUAL (klik untuk TERSEDIA)" : "TERSEDIA (klik untuk TERJUAL)"}
                          </button>
                          <div className="ucard-price">
                            <span className="ucp-l">Rp.</span>
                            <input
                              className="ucp-input"
                              type="text"
                              placeholder={(() => { const ap = autoUnitPrice(u, rates); return ap > 0 ? "auto: " + Math.round(ap).toLocaleString("id-ID") : "0"; })()}
                              value={s.price ? s.price.toLocaleString("id-ID") : ""}
                              onChange={(e) => setUnitPrice(key, e.target.value)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="bp-wrap">
                  {/* ITEMS section */}
                  <div className="bp-section">
                    <div className="bp-sec-head">
                      <div className="bp-sec-title">ITEMS</div>
                      <div className="bp-sec-total">
                        <span className="bpst-l">TOTAL HARGA ITEMS</span>
                        <span className="bpst-v green">{fmtRp(totalItemsRp)}</span>
                      </div>
                    </div>
                    <div className="bp-grid">
                      <BpItem name="Gems" icon="&#x1F48E;" color="#22d3ee" total={gems?.amount || 0} v={gemsV} rate={rates.gemRate} rateUnit="/1k" onSold={() => { setBpSoldModal("gems"); setBpSoldInput(String(gemsV.soldQty || "")); }} />
                      <BpItem name="Trait Reroll" icon="&#x1F504;" color="#818cf8" total={traitReroll?.amount || 0} v={traitV} rate={rates.traitRerollRate} rateUnit="/1k" onSold={() => { setBpSoldModal("traitReroll"); setBpSoldInput(String(traitV.soldQty || "")); }} />
                      <BpItem name="Lucky Spin" icon="&#x1F3B0;" color="#fbbf24" total={luckySpin?.amount || 0} v={luckyV} rate={rates.luckySpinRate} rateUnit="/pc" onSold={() => { setBpSoldModal("luckySpin"); setBpSoldInput(String(luckyV.soldQty || "")); }} />
                      <BpItem name="Jackpot" icon="&#x1F3AF;" color="#ef4444" total={jackpot?.amount || 0} v={jackpotV} rate={rates.jackpotRate} rateUnit="/pc" onSold={() => { setBpSoldModal("jackpot"); setBpSoldInput(String(jackpotV.soldQty || "")); }} />
                    </div>
                  </div>

                  {/* GEAR section — Divine only */}
                  <div className="bp-section">
                    <div className="bp-sec-head">
                      <div className="bp-sec-title">GEAR DIVINE</div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button
                          className="tba-btn"
                          onClick={() => { setBpSoldModal("gear:divine"); setBpSoldInput(String(totalDivineSold || "")); }}
                          style={{ fontSize: 11, padding: "6px 12px" }}
                        >
                          &#x1F3F7;&#xFE0F; Divine Terjual ({fmtNum(totalDivineSold)})
                        </button>
                        <div className="bp-sec-total">
                          <span className="bpst-l">TOTAL HARGA GEARS</span>
                          <span className="bpst-v green">{fmtRp(totalGearsRp)}</span>
                        </div>
                      </div>
                    </div>
                    {gearItems.length === 0 ? (
                      <div className="empty" style={{ padding: 30 }}>
                        Belum ada gear di backpack.<br />
                        <span style={{ fontSize: 11, opacity: .7 }}>Update Lua monitor script untuk collect gear data (Obito Mask dll).</span>
                      </div>
                    ) : (
                      <div className="bp-grid">
                        {GEAR_SLOTS.map((slot) => {
                          const slotDivineItems = gearItems.filter((g) => gearSlot(g) === slot && g.rarity?.toLowerCase() === "divine");
                          const slotDivine = slotDivineItems.reduce((s, g) => s + (g.amount || 0), 0);
                          return (
                            <div key={slot} className="bp-card">
                              <div className="bpc-head">
                                <div className="bpc-icon" style={{ background: "rgba(192,132,252,.1)", color: "#c084fc" }}>&#x2699;&#xFE0F;</div>
                                <div className="bpc-info">
                                  <div className="bpc-name">{slot.toUpperCase()}</div>
                                  <div className="bpc-sub">{slotDivine} divine</div>
                                </div>
                              </div>
                              <div className="bpc-row">
                                <span className="bpc-l">QTY (Divine)</span>
                                <span className="bpc-v" style={{ color: "#c084fc" }}>{fmtNum(slotDivine)}</span>
                              </div>
                              <div className="bpc-row">
                                <span className="bpc-l">Rp. (/ Rate)</span>
                                <span className="bpc-v green">{fmtRp(slotDivine * rates.gearRate)}</span>
                              </div>
                              {slotDivineItems.length > 0 && (
                                <div className="gear-list">
                                  {slotDivineItems.map((g, gi) => (
                                    <div key={gi} className="gear-row">
                                      <span className="gr-name">{g.name}</span>
                                      <span className="gr-rar" style={{ color: rarityColor(g.rarity) }}>Divine</span>
                                      <span className="gr-qty">x{g.amount}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* 1 Set Komplit card */}
                        <div className="bp-card" style={{ borderColor: fullSets > 0 ? "rgba(251,191,36,.4)" : undefined, background: fullSets > 0 ? "linear-gradient(135deg, rgba(251,191,36,.04), transparent), var(--card)" : undefined }}>
                          <div className="bpc-head">
                            <div className="bpc-icon" style={{ background: "rgba(251,191,36,.12)", color: "var(--gold)" }}>&#x1F3C6;</div>
                            <div className="bpc-info">
                              <div className="bpc-name" style={{ color: fullSets > 0 ? "var(--gold)" : undefined }}>1 SET KOMPLIT</div>
                              <div className="bpc-sub">Head + Torso + Back + Upper + Waist</div>
                            </div>
                          </div>
                          <div className="bpc-row">
                            <span className="bpc-l">Set Tersedia</span>
                            <span className="bpc-v" style={{ color: fullSets > 0 ? "var(--gold)" : "var(--dim)" }}>{fullSets}</span>
                          </div>
                          <div className="bpc-row">
                            <span className="bpc-l">Rate / Set</span>
                            <span className="bpc-v">{rates.gearSetRate > 0 ? fmtRp(rates.gearSetRate) : "Not set"}</span>
                          </div>
                          <div className="bpc-row">
                            <span className="bpc-l">Nilai Set</span>
                            <span className="bpc-v green">{fullSets > 0 && rates.gearSetRate > 0 ? fmtRp(setValue) : "—"}</span>
                          </div>
                          {leftoverDivine > 0 && (
                            <div className="bpc-row" style={{ background: "rgba(192,132,252,.06)", borderRadius: 6, marginTop: 4 }}>
                              <span className="bpc-l">Sisa Pcs</span>
                              <span className="bpc-v" style={{ color: "#c084fc" }}>{leftoverDivine} · {fmtRp(leftoverValue)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Rate Modal */}
      {rateModalOpen && (
        <div className="overlay" onClick={(e) => { if ((e.target as HTMLElement).classList.contains("overlay")) setRateModalOpen(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">Set Rate</div>
              <button className="modal-x" onClick={() => setRateModalOpen(false)}>&#x2715;</button>
            </div>
            <div className="modal-body">
              <div className="rates-grid">
                <RateField label="Rate Gem" sub="/ 1k gems" value={rates.gemRate} onChange={(v) => updateRate("gemRate", v)} />
                <RateField label="Rate Trait Reroll" sub="/ 1k pcs" value={rates.traitRerollRate} onChange={(v) => updateRate("traitRerollRate", v)} />
                <RateField label="Rate Lucky Spin" sub="/ pc" value={rates.luckySpinRate} onChange={(v) => updateRate("luckySpinRate", v)} />
                <RateField label="Rate Jackpot" sub="/ pc" value={rates.jackpotRate} onChange={(v) => updateRate("jackpotRate", v)} />
                <RateField label="Rate Gear" sub="/ divine gear (pc)" value={rates.gearRate} onChange={(v) => updateRate("gearRate", v)} />
                <RateField label="Rate Gear Set" sub="/ 1 set komplit (5 slot)" value={rates.gearSetRate} onChange={(v) => updateRate("gearSetRate", v)} />
                <RateField label="Rate Unit (chance < 10sx)" sub="× sx chance (bukan money)" value={rates.unitRateLow} onChange={(v) => updateRate("unitRateLow", v)} />
                <RateField label="Rate Unit (chance >= 10sx)" sub="× sx chance (bukan money)" value={rates.unitRateHigh} onChange={(v) => updateRate("unitRateHigh", v)} />
              </div>
              <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 16, lineHeight: 1.5 }}>
                Perubahan rate otomatis tersimpan.<br />
                <span style={{ color: "var(--purple)", fontWeight: 700 }}>Gear Set</span> = harga 1 set komplit (Head + Torso + Back + Upper + Waist). Gear sisa (yang belum lengkap satu set) dihitung pakai Rate Gear per pc.<br />
                <span style={{ color: "var(--cyan)", fontWeight: 700 }}>Rate Unit</span> = Rp per 1sx chance. Price otomatis = (chance / 1sx) × rate. Manual price (ketik Rp. di card unit) override auto-price.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sold Units Modal */}
      {soldUnitsOpen && (
        <div className="overlay" onClick={(e) => { if ((e.target as HTMLElement).classList.contains("overlay")) setSoldUnitsOpen(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">Unit Terjual ({soldUnitsList.length})</div>
              <button className="modal-x" onClick={() => setSoldUnitsOpen(false)}>&#x2715;</button>
            </div>
            <div className="modal-body">
              {soldUnitsList.length === 0 ? (
                <div className="empty">Belum ada unit yang terjual.</div>
              ) : (
                <div className="sold-list">
                  {soldUnitsList.map((u, i) => {
                    const key = unitKey(u);
                    const s = state.unitData[key];
                    const rc = rarityColor(rarityDisplayFor(u));
                    return (
                      <div key={i} className="sold-row">
                        <div className="sr-name">
                          <span style={{ color: rc }}>{u.variant ? `${u.variant} ` : ""}{u.name}</span>
                          <span className="sr-sub"> · {rarityDisplayFor(u)} · 1 in {fmtMoney(u.chance)}</span>
                        </div>
                        <div className="sr-price">{fmtRp(unitPrice(u))}</div>
                        <button className="sr-undo" onClick={() => toggleUnitSold(key)}>Undo</button>
                      </div>
                    );
                  })}
                  <div className="sold-total">
                    <span>Total Terjual (Units)</span>
                    <b>{fmtRp(soldUnitsList.reduce((s, u) => s + unitPrice(u), 0))}</b>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sold Items Modal */}
      {soldItemsOpen && (
        <div className="overlay" onClick={(e) => { if ((e.target as HTMLElement).classList.contains("overlay")) setSoldItemsOpen(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">Items Terjual ({soldItemsList.length})</div>
              <button className="modal-x" onClick={() => setSoldItemsOpen(false)}>&#x2715;</button>
            </div>
            <div className="modal-body">
              {soldItemsList.length === 0 ? (
                <div className="empty">Belum ada item yang ditandai terjual.</div>
              ) : (
                <div className="sold-list">
                  {soldItemsList.map((it) => (
                    <div key={it.key} className="sold-row">
                      <div className="sr-name">{it.name}</div>
                      <div className="sr-qty">x{fmtNum(it.qty)}</div>
                      <div className="sr-price">{fmtRp(it.val)}</div>
                      <button className="sr-undo" onClick={() => { const next = { ...state, bpSold: { ...state.bpSold, [`${selectedAccount}:${it.key}`]: 0 } }; saveState(next); }}>Reset</button>
                    </div>
                  ))}
                  <div className="sold-total">
                    <span>Total Terjual (Items)</span>
                    <b>{fmtRp(soldItemsList.reduce((s, x) => s + x.val, 0))}</b>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Backpack sold input modal */}
      {bpSoldModal && (
        <div className="overlay" onClick={(e) => { if ((e.target as HTMLElement).classList.contains("overlay")) setBpSoldModal(null); }}>
          <div className="modal small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">Tandai Terjual — {bpSoldModal}</div>
              <button className="modal-x" onClick={() => setBpSoldModal(null)}>&#x2715;</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 10 }}>
                Masukkan jumlah yang sudah terjual (angka absolut, bukan tambahan).
              </div>
              <input
                className="sp-input"
                type="text"
                placeholder="0"
                autoFocus
                value={bpSoldInput}
                onChange={(e) => setBpSoldInput(e.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") confirmBpSold(); }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button className="tba-btn" onClick={() => setBpSoldModal(null)} style={{ flex: 1 }}>Batal</button>
                <button className="tba-btn primary" onClick={confirmBpSold} style={{ flex: 1 }}>Simpan</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sewa Modal */}
      {sewaModalOpen && (
        <div className="overlay" onClick={(e) => { if ((e.target as HTMLElement).classList.contains("overlay")) setSewaModalOpen(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">Unit Sewa ({selectedUnits.size})</div>
              <button className="modal-x" onClick={() => setSewaModalOpen(false)}>&#x2715;</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 14 }}>
                Isi harga sewa (Rp/jam) dan deposit per unit. Kosongin = hapus dari sewa.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {Array.from(selectedUnits).map((k) => {
                  const u = sortedUnits.find((x) => unitKey(x) === k);
                  if (!u) return null;
                  const rc = rarityColor(rarityDisplayFor(u));
                  const inp = sewaInputs[k] || { pricePerHour: "", deposit: "" };
                  return (
                    <div key={k} style={{ padding: 12, background: "var(--card)", border: "1px solid #222240", borderRadius: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: rc, minWidth: 0, flex: 1 }}>
                          {u.variant ? `${u.variant} ` : ""}{u.name} <span style={{ color: "var(--dim)", fontSize: 11, fontWeight: 600 }}>· 1 in {fmtMoney(u.chance)}</span>
                        </div>
                        {state.sewa[k] && (
                          <button
                            onClick={() => { removeSewa(k); setSewaInputs((prev) => { const next = { ...prev }; delete next[k]; return next; }); setSelectedUnits((prev) => { const next = new Set(prev); next.delete(k); return next; }); }}
                            style={{ background: "rgba(239,68,68,.12)", color: "var(--red)", border: "1px solid rgba(239,68,68,.3)", padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}
                          >
                            &#x2715; Hapus Sewa
                          </button>
                        )}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", marginBottom: 4, textTransform: "uppercase" }}>Rp / jam</div>
                          <input
                            className="sp-input"
                            type="text"
                            placeholder="0"
                            value={inp.pricePerHour}
                            onChange={(e) => setSewaInputs((prev) => ({ ...prev, [k]: { ...inp, pricePerHour: e.target.value.replace(/[^0-9]/g, "") } }))}
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", marginBottom: 4, textTransform: "uppercase" }}>Deposit</div>
                          <input
                            className="sp-input"
                            type="text"
                            placeholder="0"
                            value={inp.deposit}
                            onChange={(e) => setSewaInputs((prev) => ({ ...prev, [k]: { ...inp, deposit: e.target.value.replace(/[^0-9]/g, "") } }))}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="tba-btn" onClick={() => setSewaModalOpen(false)} style={{ flex: 1 }}>Batal</button>
                <button className="tba-btn primary" onClick={confirmSewa} style={{ flex: 1 }}>Simpan Semua</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RateField({ label, sub, value, onChange }: { label: string; sub: string; value: number; onChange: (v: string) => void }) {
  // Display rupiah ÷ 100 so user types in "ratus perak" (1 = Rp 100, 10 = Rp 1k, 13 = Rp 1.3k)
  const displayVal = value ? value / 100 : 0;
  return (
    <div className="rate-field">
      <div className="rate-label">{label} <span className="rate-sublabel">{sub} <b style={{ color: "var(--cyan)" }}>(1 = 100p, 10 = 1rb)</b></span></div>
      <input className="rate-input" type="number" step="any" placeholder="0"
        value={displayVal || ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function BpItem({ name, icon, color, total, v, rate, rateUnit, onSold }: {
  name: string; icon: string; color: string; total: number;
  v: { availQty: number; soldQty: number; availVal: number; soldVal: number };
  rate: number; rateUnit: string; onSold: () => void;
}) {
  return (
    <div className="bp-card">
      <div className="bpc-head">
        <div className="bpc-icon" style={{ background: color + "18", color }} dangerouslySetInnerHTML={{ __html: icon }} />
        <div className="bpc-info">
          <div className="bpc-name">{name}</div>
          <div className="bpc-sub">Rate: {rate > 0 ? rate.toLocaleString("id-ID") : "0"} {rateUnit}</div>
        </div>
      </div>
      <button className="bpc-qty-btn" onClick={onSold} title="Klik untuk tandai terjual">
        <div className="bpc-qtyl">QTY (Tersedia / Total)</div>
        <div className="bpc-qtyv">{v.availQty.toLocaleString("id-ID")} <span style={{ opacity: .5 }}>/ {total.toLocaleString("id-ID")}</span></div>
      </button>
      <div className="bpc-row">
        <span className="bpc-l">Rp. (Tersedia)</span>
        <span className="bpc-v green">{v.availVal > 0 ? "Rp " + Math.round(v.availVal).toLocaleString("id-ID") : "-"}</span>
      </div>
      {v.soldQty > 0 && (
        <div className="bpc-row terjual-row">
          <span className="bpc-l">Terjual</span>
          <span className="bpc-v">{v.soldQty.toLocaleString("id-ID")} · Rp {Math.round(v.soldVal).toLocaleString("id-ID")}</span>
        </div>
      )}
    </div>
  );
}

const styles = `
:root {
  --bg: #0b0b14; --surface: #111120; --card: #15152a; --card-hover: #1a1a35;
  --ink: #e8e8f0; --dim: #555570; --accent: #818cf8; --accent2: #a855f7;
  --green: #34d399; --gold: #fbbf24; --red: #ef4444; --cyan: #22d3ee; --purple: #c084fc;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
.inv-wrap { max-width: 1600px; margin: 0 auto; padding: 20px 24px 40px; font-family: 'Inter', system-ui, sans-serif; }

/* Top bar */
.topbar { display: flex; justify-content: space-between; align-items: stretch; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.tb-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; flex: 1; min-width: 0; }
.tb-stat { background: var(--card); border: 1px solid #1e1e38; border-radius: 12px; padding: 14px 18px; text-align: left; }
.tb-stat.clickable { cursor: pointer; transition: all .15s; color: inherit; font-family: inherit; }
.tb-stat.clickable:hover { border-color: var(--cyan); transform: translateY(-1px); }
.tb-stat.estimasi { border-color: rgba(52,211,153,.25); background: linear-gradient(135deg, rgba(52,211,153,.04), transparent), var(--card); }
.tb-stat.terjual { border-color: rgba(251,191,36,.2); background: linear-gradient(135deg, rgba(251,191,36,.04), transparent), var(--card); }
.tbs-label { font-size: 10px; font-weight: 800; color: var(--dim); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
.tbs-value { font-size: 20px; font-weight: 900; color: var(--ink); }
.tb-stat.estimasi .tbs-value { color: var(--green); }
.tb-stat.terjual .tbs-value { color: var(--gold); }
.tbs-value.cyan { color: var(--cyan); }
.tbs-hint { font-size: 9px; color: var(--dim); font-weight: 600; margin-top: 4px; }
.tb-actions { display: flex; gap: 8px; flex-direction: column; justify-content: center; }
.tba-btn { background: var(--surface); border: 1px solid #222240; color: var(--ink); font-size: 12px; font-weight: 700; padding: 10px 16px; border-radius: 8px; cursor: pointer; transition: all .15s; white-space: nowrap; }
.tba-btn:hover { border-color: var(--accent); }
.tba-btn.primary { background: var(--accent); color: #0b0b14; border-color: var(--accent); }
.tba-btn.primary:hover { background: #6b7bff; }

/* Body layout */
.body { display: grid; grid-template-columns: 240px 1fr; gap: 16px; align-items: start; }
@media (max-width: 900px) { .body { grid-template-columns: 1fr; } }

/* Side panel */
.side-panel { background: var(--card); border: 1px solid #1e1e38; border-radius: 14px; padding: 16px; position: sticky; top: 20px; }
.sp-title { font-size: 10px; font-weight: 800; color: var(--dim); letter-spacing: 1.5px; margin-bottom: 12px; }
.sp-account { display: flex; align-items: center; gap: 10px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,.04); margin-bottom: 12px; }
.sp-avatar { width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, var(--purple), var(--accent)); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 15px; }
.sp-name { font-size: 13px; font-weight: 800; color: var(--ink); }
.sp-sub { font-size: 10px; color: var(--dim); font-weight: 600; }
.sp-section { margin-top: 12px; }
.sp-label { font-size: 9px; font-weight: 800; color: var(--dim); text-transform: uppercase; letter-spacing: .8px; margin-bottom: 8px; }
.sp-input { width: 100%; background: var(--surface); border: 1px solid #222240; color: var(--ink); font-size: 12px; font-weight: 600; padding: 8px 10px; border-radius: 7px; margin-bottom: 6px; }
.sp-input:focus { outline: none; border-color: var(--accent); }
.sp-row { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; font-size: 11px; color: var(--dim); }
.sp-row b { color: var(--ink); font-weight: 800; }
.sp-row b.cyan { color: var(--cyan); }
.sp-row b.green { color: var(--green); }
.sp-row b.purple { color: var(--purple); }
.sp-divider { height: 1px; background: rgba(255,255,255,.05); margin: 8px 0; }

/* Main */
.main { min-width: 0; }
.tab-row { display: flex; gap: 4px; margin-bottom: 14px; }
.tabb { padding: 10px 22px; font-size: 12px; font-weight: 800; cursor: pointer; color: var(--dim); background: var(--card); border: 1px solid #1e1e38; border-radius: 10px; transition: all .15s; letter-spacing: .5px; }
.tabb:hover { color: var(--ink); }
.tabb.active { background: var(--accent); color: #0b0b14; border-color: var(--accent); }
.content-box { background: var(--card); border: 1px solid #1e1e38; border-radius: 14px; padding: 18px; min-height: 400px; }

.empty { color: var(--dim); text-align: center; padding: 60px 0; font-size: 13px; }

/* Unit cards */
.ugrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.ucard { background: var(--surface); border: 1px solid #222240; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px; transition: all .15s; }
.ucard:hover { border-color: #333350; }
.ucard.sold { opacity: .55; }
.ucard.selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.ucard.sewa { border-color: var(--gold); background: linear-gradient(135deg, rgba(251,191,36,.04), transparent), var(--surface); }
.ucard-name { font-size: 14px; font-weight: 800; color: var(--ink); text-align: center; padding: 8px; border: 1px solid #333; border-radius: 8px; position: relative; display: flex; align-items: center; justify-content: center; gap: 8px; }
.ucard-check { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
.ucard-sewa-badge { font-size: 9px; font-weight: 900; padding: 2px 6px; background: var(--gold); color: #0b0b14; border-radius: 4px; letter-spacing: .5px; }
.sewa-btn { background: var(--gold) !important; color: #0b0b14 !important; border-color: var(--gold) !important; }
.clear-btn { background: var(--surface) !important; color: var(--dim) !important; }
.ucard-gt { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.ucgt { padding: 6px 8px; background: rgba(255,255,255,.02); border: 1px solid rgba(255,255,255,.05); border-radius: 6px; text-align: center; }
.ucgt-l { font-size: 8px; font-weight: 800; color: var(--dim); letter-spacing: .5px; margin-bottom: 2px; }
.ucgt-v { font-size: 11px; font-weight: 800; color: var(--ink); }
.ucard-chance { padding: 8px; border: 1px solid; border-radius: 8px; text-align: center; }
.ucc-l { font-size: 8px; font-weight: 800; letter-spacing: .8px; opacity: .8; margin-bottom: 2px; }
.ucc-v { font-size: 15px; font-weight: 900; }
.ucard-li { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.ucli { padding: 6px 8px; background: rgba(255,255,255,.02); border: 1px solid rgba(255,255,255,.05); border-radius: 6px; text-align: center; }
.ucli-l { font-size: 8px; font-weight: 800; color: var(--dim); letter-spacing: .5px; margin-bottom: 2px; }
.ucli-v { font-size: 12px; font-weight: 800; color: var(--ink); }
.ucli-v.green { color: var(--green); }
.ucard-status { padding: 8px; border-radius: 8px; font-size: 10px; font-weight: 800; letter-spacing: .5px; cursor: pointer; border: none; transition: all .15s; }
.ucard-status.avail { background: rgba(52,211,153,.12); color: var(--green); border: 1px solid rgba(52,211,153,.3); }
.ucard-status.avail:hover { background: rgba(52,211,153,.2); }
.ucard-status.sold { background: rgba(239,68,68,.12); color: var(--red); border: 1px solid rgba(239,68,68,.3); }
.ucard-status.sold:hover { background: rgba(239,68,68,.2); }
.ucard-price { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: rgba(52,211,153,.06); border: 1px solid rgba(52,211,153,.15); border-radius: 8px; }
.ucp-l { font-size: 12px; font-weight: 800; color: var(--green); }
.ucp-input { flex: 1; background: none; border: none; color: var(--ink); font-size: 14px; font-weight: 800; font-family: inherit; }
.ucp-input:focus { outline: none; }
.ucp-input::placeholder { color: var(--dim); }

/* Backpack */
.bp-wrap { display: flex; flex-direction: column; gap: 20px; }
.bp-section { background: var(--surface); border: 1px solid #222240; border-radius: 12px; padding: 14px; }
.bp-sec-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px; }
.bp-sec-title { font-size: 12px; font-weight: 800; color: var(--accent); letter-spacing: 1px; text-transform: uppercase; }
.bp-sec-total { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: rgba(52,211,153,.06); border: 1px solid rgba(52,211,153,.15); border-radius: 8px; }
.bpst-l { font-size: 9px; font-weight: 800; color: var(--dim); text-transform: uppercase; letter-spacing: .5px; }
.bpst-v { font-size: 14px; font-weight: 900; }
.bpst-v.green { color: var(--green); }

.bp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.bp-card { background: var(--card); border: 1px solid #222240; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px; transition: all .15s; }
.bp-card:hover { border-color: #2a2a50; }
.bpc-head { display: flex; align-items: center; gap: 10px; }
.bpc-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
.bpc-info { flex: 1; min-width: 0; }
.bpc-name { font-size: 13px; font-weight: 800; color: var(--ink); }
.bpc-sub { font-size: 10px; color: var(--dim); font-weight: 600; }
.bpc-qty-btn { padding: 8px 10px; background: rgba(34,211,238,.05); border: 1px solid rgba(34,211,238,.15); border-radius: 8px; cursor: pointer; text-align: left; transition: all .15s; font-family: inherit; }
.bpc-qty-btn:hover { background: rgba(34,211,238,.1); border-color: rgba(34,211,238,.3); }
.bpc-qtyl { font-size: 9px; font-weight: 700; color: var(--dim); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 2px; }
.bpc-qtyv { font-size: 15px; font-weight: 900; color: var(--cyan); }
.bpc-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-top: 1px solid rgba(255,255,255,.04); }
.bpc-l { font-size: 10px; font-weight: 700; color: var(--dim); }
.bpc-v { font-size: 13px; font-weight: 800; color: var(--ink); }
.bpc-v.green { color: var(--green); }
.bpc-row.terjual-row { background: rgba(251,191,36,.06); border-radius: 6px; border-top: none; margin-top: 4px; }
.bpc-row.terjual-row .bpc-v { color: var(--gold); font-size: 11px; }

.gear-list { display: flex; flex-direction: column; gap: 3px; margin-top: 4px; max-height: 200px; overflow-y: auto; }
.gear-row { display: flex; align-items: center; justify-content: space-between; padding: 5px 8px; background: rgba(255,255,255,.02); border-radius: 5px; font-size: 11px; }
.gr-name { color: var(--ink); font-weight: 700; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gr-rar { font-weight: 800; font-size: 9px; }
.gr-qty { color: var(--dim); font-weight: 700; margin-left: 6px; }

/* Modals */
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,.75); display: flex; align-items: flex-start; justify-content: center; padding: 60px 16px 20px; overflow-y: auto; z-index: 100; backdrop-filter: blur(6px); }
.modal { background: var(--bg); border: 1px solid #222240; border-radius: 16px; width: 100%; max-width: 600px; overflow: hidden; }
.modal.small { max-width: 400px; }
.modal-head { padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,.05); background: var(--card); }
.modal-title { font-size: 14px; font-weight: 900; color: var(--ink); letter-spacing: .3px; }
.modal-x { background: none; border: none; color: var(--dim); font-size: 20px; cursor: pointer; padding: 4px 8px; border-radius: 6px; }
.modal-x:hover { color: var(--ink); background: var(--surface); }
.modal-body { padding: 20px; max-height: 70vh; overflow-y: auto; }

.rates-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.rate-field { }
.rate-label { font-size: 10px; font-weight: 800; color: var(--dim); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
.rate-sublabel { font-size: 9px; color: #444460; font-weight: 600; text-transform: none; letter-spacing: 0; }
.rate-input { width: 100%; background: var(--surface); border: 1px solid #222240; color: var(--ink); font-size: 14px; font-weight: 800; padding: 10px 12px; border-radius: 8px; }
.rate-input:focus { outline: none; border-color: var(--accent); }

.sold-list { display: flex; flex-direction: column; gap: 8px; }
.sold-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: var(--card); border: 1px solid #222240; border-radius: 8px; }
.sr-name { flex: 1; font-size: 13px; font-weight: 700; color: var(--ink); }
.sr-sub { font-size: 11px; color: var(--dim); font-weight: 600; }
.sr-qty { font-size: 12px; color: var(--cyan); font-weight: 800; }
.sr-price { font-size: 13px; color: var(--green); font-weight: 900; }
.sr-undo { padding: 5px 10px; background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.2); color: var(--red); font-size: 10px; font-weight: 800; border-radius: 6px; cursor: pointer; }
.sr-undo:hover { background: rgba(239,68,68,.2); }
.sold-total { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; margin-top: 10px; background: rgba(52,211,153,.08); border: 1px solid rgba(52,211,153,.2); border-radius: 8px; font-size: 13px; font-weight: 700; color: var(--ink); }
.sold-total b { color: var(--green); font-size: 16px; font-weight: 900; }
`;
