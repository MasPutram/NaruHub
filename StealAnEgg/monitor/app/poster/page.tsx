"use client";

import { Suspense, useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";

export default function PosterPageWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "#8b8ba3" }}>Memuat...</div>}>
      <PosterPage />
    </Suspense>
  );
}

interface Pet {
  category: string;
  name?: string;
  rate: number;
  mutations?: string[];
  weight?: number;
  ready?: boolean;
  remainingSeconds?: number;
  rarity?: string;
}

interface AccountSummary {
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
  topPets: Pet[];
  online: boolean;
}

interface AccountDetail {
  activePets: Pet[];
  activeLimit: number | null;
  allPets: Pet[];
  growingEggs: Pet[];
  backpackEggs: Pet[];
}

const MAX_EQUIP = 17;
const HIGH_VALUE_THRESHOLD = 1_000_000_000;
const NOTABLE_THRESHOLD = 300_000_000;

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "-";
  const n = Number(v);
  const abs = Math.abs(n);
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

function fmtCompact(v: number | null | undefined): string {
  if (v == null) return "-";
  const n = Number(v);
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(1) + "T+";
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "B+";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M+";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K+";
  return n.toLocaleString("en-US");
}

function fmtDuration(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return "SIAP MENETAS!";
  seconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtWeight(w: number | undefined): string {
  if (!w) return "";
  if (w >= 1) return w.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " Kg";
  return w.toFixed(2) + " Kg";
}

function petKey(p: Pet): string {
  return `${p.category}|${(p.mutations || []).slice().sort().join("+")}|${p.rate}`;
}

function computeIncomePotensiPetAktif(detail: AccountDetail | null): number {
  if (!detail) return 0;
  const pool = [
    ...(detail.activePets || []),
    ...(detail.allPets || []),
    ...(detail.growingEggs || []),
    ...(detail.backpackEggs || []),
  ].sort((a, b) => (b.rate || 0) - (a.rate || 0));
  let total = 0;
  for (let i = 0; i < Math.min(MAX_EQUIP, pool.length); i++) {
    total += pool[i].rate || 0;
  }
  return total;
}

function computeHighValuePetTotal(detail: AccountDetail | null): number {
  if (!detail) return 0;
  const pool = [
    ...(detail.activePets || []),
    ...(detail.allPets || []),
    ...(detail.growingEggs || []),
    ...(detail.backpackEggs || []),
  ];
  return pool.reduce((sum, p) => sum + ((p.rate || 0) >= HIGH_VALUE_THRESHOLD ? (p.rate || 0) : 0), 0);
}

function formatRupiah(n: number): string {
  const s = Math.abs(Math.round(n)).toString();
  const reversed = s.split("").reverse().join("");
  const dotted = reversed.replace(/(\d{3})(?=\d)/g, "$1.");
  return "Rp " + (n < 0 ? "-" : "") + dotted.split("").reverse().join("");
}

function computeAutoPrice(detail: AccountDetail | null, ratePerBStr: string, rateHvPerBStr: string): string {
  if (!detail) return "";
  const ratePerB = (parseFloat(ratePerBStr) || 0) * 1000;
  const rateHvPerB = (parseFloat(rateHvPerBStr) || 0) * 1000;
  if (ratePerB === 0 && rateHvPerB === 0) return "";
  const incomeB = computeIncomePotensiPetAktif(detail) / 1e9;
  const highvalueB = computeHighValuePetTotal(detail) / 1e9;
  const priceValue = Math.round(incomeB * ratePerB + highvalueB * rateHvPerB);
  if (priceValue <= 0) return "";
  return formatRupiah(priceValue);
}

/** Mirrors Python's account_initials(): "BlekokGong20" -> "BG20" (uppercase
 * letters in the name + trailing digits). */
function accountInitials(name: string | null | undefined): string {
  if (!name) return "";
  const m = name.match(/(\d+)$/);
  const digits = m ? m[1] : "";
  const lettersPart = digits ? name.slice(0, name.length - digits.length) : name;
  let caps = "";
  for (const ch of lettersPart) {
    if (ch !== ch.toLowerCase() && ch === ch.toUpperCase()) caps += ch;
  }
  if (!caps) caps = lettersPart.slice(0, 2).toUpperCase();
  return caps + digits;
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

// Icon lookup uses the raw in-game category (e.g. "Shark"), but some pets
// display a different name in-game than their internal category.
const CATEGORY_DISPLAY_NAME: Record<string, string> = {
  Shark: "Mutant Shark",
};

function displayName(category: string): string {
  return CATEGORY_DISPLAY_NAME[category] || category;
}

function petIconUrl(p: Pet, index: Record<string, string>): string | null {
  const filename = index[p.category];
  if (filename) {
    return `/icons/normal/${encodeURIComponent(filename)}`;
  }
  return null;
}

function PetIcon({ pet, size = 48 }: { pet: Pet; size?: number }) {
  const [index, setIndex] = useState<Record<string, string>>({});
  useEffect(() => { loadIconIndex().then(setIndex); }, []);

  const staticSrc = petIconUrl(pet, index);
  const fallbackSrc = `/api/pet-icon?category=${encodeURIComponent(pet.category)}`;

  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(staticSrc);
    setFailed(false);
  }, [staticSrc]);

  if (!src || failed) {
    if (!staticSrc && !failed && pet.category) {
      return (
        <img
          src={fallbackSrc}
          alt={pet.category}
          width={size}
          height={size}
          style={{ borderRadius: 10, objectFit: "contain", background: "#f1f5f9", flexShrink: 0 }}
          onError={() => setFailed(true)}
        />
      );
    }
    return (
      <div
        style={{
          width: size, height: size, background: "#f1f5f9", borderRadius: 10,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: size * 0.4, color: "#94a3b8", flexShrink: 0,
        }}
      >
        🐾
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={pet.category}
      width={size}
      height={size}
      style={{ borderRadius: 10, objectFit: "contain", background: "#f1f5f9", flexShrink: 0 }}
      onError={() => {
        if (staticSrc && !failed) {
          setSrc(fallbackSrc);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

function mutColor(mut: string): string {
  const m = mut.toLowerCase();
  if (m.includes("rainbow")) return "#9333ea";
  if (m.includes("golden")) return "#ca8a04";
  if (m.includes("silver")) return "#64748b";
  return "#2563eb";
}

function groupByMutation(pets: Pet[]): [string, Pet[]][] {
  const groups: Record<string, Pet[]> = {};
  for (const p of pets) {
    if (!p.mutations || p.mutations.length === 0) continue;
    const key = p.mutations.map((m) => m.toUpperCase()).sort().join(" + ");
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }
  return Object.entries(groups).sort((a, b) => {
    const maxA = Math.max(0, ...a[1].map((p) => p.rate || 0));
    const maxB = Math.max(0, ...b[1].map((p) => p.rate || 0));
    return maxB - maxA;
  });
}

function PosterPage() {
  const params = useSearchParams();
  const accountName = params.get("account") || "";
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [price, setPrice] = useState("");
  const [ratePerB, setRatePerB] = useState("5");
  const [rateHvPerB, setRateHvPerB] = useState("3");
  const [title, setTitle] = useState("Jual Akun GACOR");
  const [badge, setBadge] = useState("");
  const [owner, setOwner] = useState("Putra Ramadhan");
  const [checklist, setChecklist] = useState("Data Polos, No Topi, No Sum");
  const [downloading, setDownloading] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    if (!accountName) return;
    try {
      const [accRes, detRes] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/account-detail?account=" + encodeURIComponent(accountName)),
      ]);
      const accData = await accRes.json();
      let found = (accData.accounts || []).find(
        (a: AccountSummary) => a.sourceAccount === accountName
      );

      if (!found) {
        try {
          const catRes = await fetch("/api/catalog-accounts");
          const catData = await catRes.json();
          found = (catData.accounts || []).find(
            (a: AccountSummary) => a.sourceAccount === accountName
          );
        } catch {}
      }

      if (found) setSummary(found);

      const detData = await detRes.json();
      if (detData.ok) {
        setDetail({
          activePets: detData.activePets || [],
          activeLimit: detData.activeLimit,
          allPets: detData.allPets || [],
          growingEggs: detData.growingEggs || [],
          backpackEggs: detData.backpackEggs || [],
        });
      }
    } catch {}
    setLoading(false);
  }, [accountName]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function downloadPoster() {
    if (!posterRef.current) return;
    setDownloading(true);
    try {
      const { default: html2canvas } = await import("html2canvas-pro");
      const canvas = await html2canvas(posterRef.current, {
        scale: 2,
        backgroundColor: "#DFE7F0",
        useCORS: true,
      });
      const link = document.createElement("a");
      const digits = accountName.match(/(\d+)$/)?.[1] || "";
      link.download = `Blekok-${digits}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      alert("Gagal download: " + (e as Error).message);
    }
    setDownloading(false);
  }

  if (!accountName) {
    return (
      <div style={{ padding: 40, color: "#8b8ba3", fontFamily: "sans-serif" }}>
        <p>Parameter <code>?account=NamaAkun</code> diperlukan.</p>
        <a href="/" style={{ color: "#a78bfa" }}>Kembali ke Dashboard</a>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 40, color: "#8b8ba3", fontFamily: "sans-serif" }}>
        Memuat data akun...
      </div>
    );
  }

  if (!summary) {
    return (
      <div style={{ padding: 40, color: "#8b8ba3", fontFamily: "sans-serif" }}>
        <p>Akun <strong>{accountName}</strong> tidak ditemukan atau sedang offline.</p>
        <a href="/" style={{ color: "#a78bfa" }}>Kembali ke Dashboard</a>
      </div>
    );
  }

  const allPets = detail?.allPets || [];
  const activePets = detail?.activePets || [];
  const growingEggs = detail?.growingEggs || [];
  const backpackEggs = detail?.backpackEggs || [];
  const activeLimit = detail?.activeLimit || MAX_EQUIP;

  const allCombined = [...allPets, ...activePets, ...backpackEggs, ...growingEggs];
  const allDeduped: Pet[] = [];
  const allSeenUids = new Set<string>();
  for (const p of allCombined) {
    const k = petKey(p);
    if (!allSeenUids.has(k)) { allSeenUids.add(k); allDeduped.push(p); }
  }
  const allSorted = allDeduped.sort((a, b) => (b.rate || 0) - (a.rate || 0));
  const growingEggsSorted = [...growingEggs].sort((a, b) => (b.rate || 0) - (a.rate || 0));
  const backpackEggsSorted = [...backpackEggs].sort((a, b) => (b.rate || 0) - (a.rate || 0));
  const eggKeys = new Set([...growingEggsSorted, ...backpackEggsSorted].map(petKey));

  // "Aktif" -- 17 rate TERTINGGI dari gabungan pet aktif + isi tas + telur
  // (lagi tumbuh + di tas), terlepas lagi keequip/ditaro apa ngga.
  const petPoolSorted = [...activePets, ...allPets, ...growingEggs, ...backpackEggs].sort(
    (a, b) => (b.rate || 0) - (a.rate || 0)
  );
  const activePetsSorted = petPoolSorted.slice(0, MAX_EQUIP);

  // Kandidat 3 card utama + Paling Gacor.
  const uniqueSeen = new Set<string>();
  const uniquePool: Pet[] = [];
  for (const p of [...activePetsSorted, ...allSorted, ...growingEggsSorted, ...backpackEggsSorted]) {
    const k = petKey(p);
    if (!uniqueSeen.has(k)) {
      uniqueSeen.add(k);
      uniquePool.push(p);
    }
  }
  const poolSorted = [...uniquePool].sort((a, b) => (b.rate || 0) - (a.rate || 0));

  const mutatedAbove1B = poolSorted.filter(
    (p) => p.mutations && p.mutations.length > 0 && (p.rate || 0) >= HIGH_VALUE_THRESHOLD
  );
  let featured: Pet | null = mutatedAbove1B[0] || poolSorted[0] || null;
  const featuredKey = featured ? petKey(featured) : null;

  const topPicks: Pet[] = [];
  for (const p of poolSorted) {
    if (featuredKey && petKey(p) === featuredKey) continue;
    topPicks.push(p);
    if (topPicks.length >= 3) break;
  }

  const featuredKeys = new Set(topPicks.map(petKey));
  if (featured) featuredKeys.add(petKey(featured));

  const rightPanelPets: Pet[] = [];
  const rightSeen = new Set<string>();
  for (const p of activePetsSorted) {
    const k = petKey(p);
    if (!featuredKeys.has(k) && !rightSeen.has(k)) {
      rightSeen.add(k);
      rightPanelPets.push(p);
    }
  }
  for (const p of allSorted) {
    if ((p.rate || 0) <= NOTABLE_THRESHOLD) continue;
    const k = petKey(p);
    if (!featuredKeys.has(k) && !rightSeen.has(k)) {
      rightSeen.add(k);
      rightPanelPets.push(p);
    }
  }
  rightPanelPets.sort((a, b) => (b.rate || 0) - (a.rate || 0));
  const rightPanelShown = rightPanelPets.slice(0, 8);
  const shownInActiveKeys = new Set(rightPanelShown.map(petKey));

  const mutGroups = groupByMutation(allSorted);
  const groupsShown = mutGroups.slice(0, 6).map(([name, items]) => [
    name,
    [...items].sort((a, b) => (b.rate || 0) - (a.rate || 0)).slice(0, 6),
  ] as [string, Pet[]]);
  const groupShownKeys = new Set<string>();
  for (const [, items] of groupsShown) {
    for (const p of items) groupShownKeys.add(petKey(p));
  }

  // Telur yang udah kepromosi ke card utama / Paling Gacor / panel ACTIVE
  // ga usah dobel muncul lagi di section "sedang tumbuh" / "di tas".
  const growingEggsRemaining = growingEggsSorted.filter(
    (e) => !featuredKeys.has(petKey(e)) && !shownInActiveKeys.has(petKey(e))
  );
  const backpackEggsRemaining = backpackEggsSorted.filter(
    (e) => !featuredKeys.has(petKey(e)) && !shownInActiveKeys.has(petKey(e))
  );

  // Pet isi tas yang ga kepajang di mana pun -- ditampilin sebagai counter "+N".
  const shownPetKeys = new Set<string>([
    ...Array.from(featuredKeys),
    ...Array.from(groupShownKeys),
    ...Array.from(shownInActiveKeys),
  ]);
  const inactiveUnlisted = allSorted.filter((p) => !shownPetKeys.has(petKey(p)));
  const inactiveTotalRate = inactiveUnlisted.reduce((s, p) => s + (p.rate || 0), 0);

  const potentialActiveRate = activePetsSorted.reduce((s, p) => s + (p.rate || 0), 0);
  const highValueTotal = [...allPets, ...activePets, ...growingEggs, ...backpackEggs]
    .filter((p) => (p.rate || 0) >= HIGH_VALUE_THRESHOLD)
    .reduce((s, p) => s + (p.rate || 0), 0);

  const totalEggs = growingEggs.length + backpackEggs.length;

  const statItems = [
    { label: "SPEED", value: fmtCompact(summary.speed) },
    { label: "CASH", value: fmtMoney(summary.money) },
    { label: "INCOME POTENSI PET AKTIF", value: fmtRate(potentialActiveRate) },
    { label: "TOTAL PET >= 1B/S", value: fmtRate(highValueTotal) },
    { label: "TOTAL EGG", value: `${totalEggs} eggs` },
    ...(summary.treadmillLevel != null
      ? [{ label: "TREADMILL LEVEL", value: `Lv. ${summary.treadmillLevel}` }]
      : []),
  ];

  const initials = accountInitials(accountName);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0b0b12; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
        .controls {
          background: #14141f; border-bottom: 1px solid #262636;
          padding: 16px 24px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
          position: sticky; top: 0; z-index: 100;
        }
        .controls a { color: #a78bfa; text-decoration: none; font-size: 14px; font-weight: 700; }
        .controls label { color: #8b8ba3; font-size: 12px; font-weight: 700; }
        .controls input {
          background: #1c1c2b; color: #e8e8f0; border: 1px solid #262636; border-radius: 8px;
          padding: 6px 10px; font-size: 13px; width: 200px;
        }
        .controls input:focus { outline: none; border-color: #a78bfa; }
        .dlbtn {
          background: #a78bfa; color: #1a1030; border: none; border-radius: 8px;
          padding: 8px 18px; font-size: 13px; font-weight: 800; cursor: pointer;
        }
        .dlbtn:hover { filter: brightness(1.1); }
        .dlbtn:disabled { opacity: .6; cursor: default; }
        .poster-wrap { display: flex; justify-content: center; padding: 24px; overflow-x: auto; }

        .poster {
          width: 1080px; min-height: 600px; background: #DFE7F0; padding: 32px;
          font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1e293b;
          display: flex; gap: 16px;
        }
        .left { width: 608px; flex-shrink: 0; }
        .right { width: 392px; flex-shrink: 0; }

        .poster-title { font-size: 40px; font-weight: 800; color: #1e293b; margin-bottom: 12px; }
        .badge-pill {
          display: inline-block; background: #e2e8f0; border: 2px solid #2563eb;
          border-radius: 20px; padding: 8px 20px; font-size: 15px; font-weight: 800;
          color: #2563eb; margin-bottom: 16px;
        }
        .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }
        .stat-cell {
          background: #ecfdf5; border: 2px solid #16a34a; border-radius: 16px; padding: 10px 14px;
        }
        .stat-cell .slabel { font-size: 11px; font-weight: 700; color: #64748b; letter-spacing: .3px; }
        .stat-cell .sval { font-size: 24px; font-weight: 800; color: #16a34a; margin-top: 2px; }

        .top3 { display: flex; gap: 14px; margin-bottom: 18px; }
        .pick-card {
          flex: 1; background: #fff; border: 1px solid #cbd5e1; border-radius: 16px;
          padding: 14px; text-align: center; min-height: 300px; position: relative;
          display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
        }
        .pick-egg-badge {
          position: absolute; top: 10px; left: 10px;
          background: #fff4d6; border: 1px solid #ca8a04; border-radius: 10px;
          padding: 3px 10px; font-size: 11px; font-weight: 700; color: #ca8a04;
        }
        .pick-weight {
          position: absolute; top: 10px; right: 10px;
          font-size: 13px; color: #64748b;
        }
        .pick-icon-wrap {
          width: 100%; height: 120px; display: flex; align-items: center; justify-content: center;
          margin-bottom: 10px;
        }
        .pick-card .pname { font-size: 18px; font-weight: 800; color: #1e293b; margin-bottom: 6px; word-break: break-word; }
        .pick-card .prate { font-size: 16px; font-weight: 800; color: #16a34a; }
        .pick-card .pmut { font-size: 11px; font-weight: 700; margin-top: 6px; }
        .egg-badge {
          display: inline-block; background: #fff4d6; border: 1px solid #ca8a04;
          border-radius: 10px; padding: 2px 8px; font-size: 10px; font-weight: 700; color: #ca8a04;
        }

        .featured-box {
          background: #fff; border: 3px solid #ca8a04; border-radius: 16px;
          padding: 32px 20px 16px; margin-bottom: 18px; position: relative; min-height: 200px;
        }
        .featured-ribbon {
          position: absolute; top: -14px; left: -4px;
          background: #ca8a04; color: #fff; font-size: 12px; font-weight: 800;
          padding: 6px 16px; border-radius: 10px; white-space: nowrap;
        }
        .featured-egg-badge { position: absolute; top: -12px; left: 182px; }
        .featured-content { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .featured-text { min-width: 0; }
        .featured-name { font-size: 24px; font-weight: 800; color: #1e293b; margin-top: 4px; }
        .featured-rate { font-size: 30px; font-weight: 800; color: #16a34a; margin-top: 6px; }
        .featured-mut { font-size: 15px; font-weight: 700; }
        .featured-weight { font-size: 15px; color: #64748b; margin-top: 6px; }
        .featured-icon-wrap {
          flex-shrink: 0; width: 170px; height: 160px;
          display: flex; align-items: center; justify-content: center;
        }

        .section-header {
          background: #e2e8f0; border-radius: 20px; padding: 8px 0;
          text-align: center; font-size: 16px; font-weight: 800; color: #1e293b;
          margin-bottom: 12px;
        }
        .mut-group-label { font-size: 13px; font-weight: 700; margin-bottom: 6px; }
        .mut-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
        .mut-cell {
          background: #fff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px;
          display: flex; align-items: center; gap: 8px; min-height: 86px;
        }
        .mut-cell .mrate { font-size: 14px; font-weight: 800; color: #16a34a; }
        .mut-cell .mname { font-size: 11px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mut-cell .mweight { font-size: 10px; color: #64748b; }

        .right-header {
          background: #fff; border: 1px solid #cbd5e1; border-radius: 16px;
          padding: 12px 16px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;
        }
        .right-header .count { font-size: 16px; font-weight: 800; color: #1e293b; }
        .equip-badge {
          margin-left: auto; background: #16a34a; color: #fff; border-radius: 8px;
          padding: 6px 14px; font-size: 12px; font-weight: 800;
        }

        .pet-list {
          background: #fff; border: 1px solid #cbd5e1; border-radius: 16px;
          padding: 10px 16px; margin-bottom: 12px;
        }
        .pet-row {
          padding: 10px 0; display: flex; align-items: center; gap: 12px;
          border-bottom: 1px solid #e2e8f0;
        }
        .pet-row:last-child { border-bottom: none; }
        .pet-info { min-width: 0; }
        .pet-info .piname { font-size: 15px; font-weight: 800; color: #1e293b; }
        .pet-info .pirate { font-size: 14px; font-weight: 700; color: #16a34a; }
        .pet-info .piweight { font-size: 11px; color: #64748b; }
        .mut-tag {
          border-radius: 10px; padding: 4px 10px; font-size: 10px; font-weight: 700;
          border: 1px solid; margin-left: auto; white-space: nowrap;
        }

        .inventory-box {
          background: #fff; border: 1px solid #cbd5e1; border-radius: 16px;
          padding: 16px 20px; margin-bottom: 12px;
        }
        .inv-label { font-size: 14px; font-weight: 700; color: #64748b; margin-bottom: 10px; }
        .inv-row { display: flex; align-items: baseline; gap: 10px; }
        .inv-count { font-size: 30px; font-weight: 800; color: #1e293b; }
        .inv-total { font-size: 13px; font-weight: 700; color: #16a34a; }

        .price-box {
          background: #fff; border: 1px solid #cbd5e1; border-radius: 16px;
          padding: 20px; margin-bottom: 12px; text-align: center;
        }
        .price-label { font-size: 20px; font-weight: 800; color: #1e293b; margin-bottom: 12px; }
        .price-value {
          font-size: 28px; font-weight: 800; color: #16a34a; min-height: 40px;
        }
        .price-empty {
          border: 2px dashed #cbd5e1; border-radius: 12px; padding: 20px;
          color: #94a3b8; font-size: 14px;
        }

        .egg-section { margin-bottom: 14px; }
        .egg-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .egg-cell {
          background: #fff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px;
          display: flex; align-items: center; gap: 8px; min-height: 86px;
        }
        .egg-cell .ename { font-size: 11px; font-weight: 700; color: #1e293b; }
        .egg-cell .erate { font-size: 13px; font-weight: 800; color: #16a34a; }
        .egg-cell .etime { font-size: 12px; font-weight: 700; color: #2563eb; }
        .egg-cell .eweight { font-size: 10px; color: #64748b; }

        .account-tag {
          position: absolute; bottom: 12px; right: 16px;
          font-size: 20px; font-weight: 800; color: #64748b;
        }

        .watermark-layer {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          transform: rotate(-30deg); pointer-events: none; z-index: 10;
          overflow: visible;
        }
        .watermark-text {
          font-size: 120px; font-weight: 800; color: rgba(30, 41, 59, 0.06);
          white-space: nowrap; line-height: 1.4; text-align: center;
        }
        .watermark-sub {
          font-size: 40px; font-weight: 800; color: rgba(30, 41, 59, 0.045);
          white-space: nowrap; text-align: center;
        }

        .detail-box {
          background: #fff; border: 1px solid #cbd5e1; border-radius: 16px;
          padding: 16px 20px; margin-bottom: 12px;
        }
        .detail-title { font-size: 16px; font-weight: 800; color: #1e293b; margin-bottom: 10px; }
        .detail-item { display: flex; align-items: center; gap: 10px; padding: 3px 0; }
        .detail-check {
          width: 18px; height: 18px; border-radius: 50%; border: 2px solid #16a34a;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .detail-check svg { width: 10px; height: 10px; }
        .detail-label { font-size: 15px; color: #1e293b; }
      `}</style>

      <div className="controls">
        <label>Judul:</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
        <label>Badge:</label>
        <input value={badge} onChange={(e) => setBadge(e.target.value)} placeholder="contoh: TERMURAH" />
        <label>Harga (langsung):</label>
        <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="kosongin = auto" style={{ width: 120 }} />
        <label>Rate Income/1B (rb):</label>
        <input value={ratePerB} onChange={(e) => setRatePerB(e.target.value)} placeholder="5" style={{ width: 50 }} />
        <label>Rate Pet≥1B/1B (rb):</label>
        <input value={rateHvPerB} onChange={(e) => setRateHvPerB(e.target.value)} placeholder="3" style={{ width: 50 }} />
        <label>Owner:</label>
        <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="nama Facebook" />
        <label>Checklist:</label>
        <input value={checklist} onChange={(e) => setChecklist(e.target.value)} placeholder="Data Polos, No Topi, No Sum" style={{ width: 280 }} />
        <button className="dlbtn" onClick={downloadPoster} disabled={downloading}>
          {downloading ? "Downloading..." : "Download PNG"}
        </button>
      </div>

      <div className="poster-wrap">
        <div className="poster" ref={posterRef} style={{ position: "relative" }}>
          {/* LEFT COLUMN */}
          <div className="left">
            <div className="poster-title">{title}</div>
            {badge && <div className="badge-pill">{badge}</div>}

            <div className="stat-grid">
              {statItems.map((s, i) => (
                <div key={i} className="stat-cell">
                  <div className="slabel">{s.label}</div>
                  <div className="sval">{s.value}</div>
                </div>
              ))}
            </div>

            {topPicks.length > 0 && (
              <div className="top3">
                {topPicks.map((p, i) => {
                  const isEgg = eggKeys.has(petKey(p));
                  return (
                    <div key={i} className="pick-card">
                      {isEgg && <span className="pick-egg-badge">TELUR</span>}
                      <div className="pick-weight">{p.weight ? fmtWeight(p.weight) : ""}</div>
                      <div className="pick-icon-wrap"><PetIcon pet={p} size={120} /></div>
                      <div className="pname">{p.name || displayName(p.category)}</div>
                      <div className="prate">{fmtRate(p.rate)}</div>
                      {p.mutations && p.mutations.length > 0 && (
                        <div className="pmut" style={{ color: mutColor(p.mutations[0]) }}>
                          MUTASI: {p.mutations.map((m) => m.toUpperCase()).join(" + ")}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {featured && (
              <div className="featured-box">
                <div className="featured-ribbon">PALING GACOR!</div>
                {eggKeys.has(petKey(featured)) && (
                  <span className="egg-badge featured-egg-badge">TELUR</span>
                )}
                <div className="featured-content">
                  <div className="featured-text">
                    {featured.mutations && featured.mutations.length > 0 && (
                      <div className="featured-mut" style={{ color: mutColor(featured.mutations[0]) }}>
                        {featured.mutations.map((m) => m.toUpperCase()).join(" + ")}
                      </div>
                    )}
                    <div className="featured-name">{(featured.name || displayName(featured.category)).toUpperCase()}</div>
                    <div className="featured-rate">{fmtRate(featured.rate)}</div>
                    {featured.weight ? <div className="featured-weight">{fmtWeight(featured.weight)}</div> : null}
                  </div>
                  <div className="featured-icon-wrap"><PetIcon pet={featured} size={160} /></div>
                </div>
              </div>
            )}

            {groupsShown.length > 0 && (
              <>
                <div className="section-header">DIKELOMPOKKAN PER MUTASI</div>
                {groupsShown.map(([groupName, items]) => {
                  const originalCount = mutGroups.find(([n]) => n === groupName)?.[1].length ?? items.length;
                  return (
                    <div key={groupName}>
                      <div className="mut-group-label" style={{ color: mutColor(groupName.split(" + ")[0]) }}>
                        {groupName} ({originalCount})
                      </div>
                      <div className="mut-grid">
                        {items.map((p, i) => (
                          <div key={i} className="mut-cell">
                            <PetIcon pet={p} size={70} />
                            <div style={{ minWidth: 0, overflow: "hidden" }}>
                              <div className="mrate">{fmtRate(p.rate)}</div>
                              <div className="mname">{p.name || displayName(p.category)}</div>
                              {p.weight ? <div className="mweight">{fmtWeight(p.weight)}</div> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {growingEggsRemaining.length > 0 && (
              <div className="egg-section">
                <div className="section-header">TELUR YANG SEDANG TUMBUH</div>
                <div className="egg-grid">
                  {growingEggsRemaining.slice(0, 9).map((e, i) => (
                    <div key={i} className="egg-cell">
                      <PetIcon pet={e} size={70} />
                      <div style={{ minWidth: 0, overflow: "hidden" }}>
                        <div className="ename">
                          {e.mutations && e.mutations.length > 0
                            ? e.mutations.map((m) => m.toUpperCase()).join(" + ") + " " + displayName(e.category)
                            : displayName(e.category)}
                        </div>
                        {e.ready ? (
                          <div className="erate">SIAP MENETAS!</div>
                        ) : (
                          <div className="etime">{fmtDuration(e.remainingSeconds)}</div>
                        )}
                        {e.rate ? <div className="erate">{fmtRate(e.rate)}</div> : null}
                        {e.weight ? <div className="eweight">{fmtWeight(e.weight)}</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {backpackEggsRemaining.length > 0 && (
              <div className="egg-section">
                <div className="section-header">TELUR DI TAS (BELUM DITARUH)</div>
                <div className="egg-grid">
                  {backpackEggsRemaining.slice(0, 9).map((e, i) => (
                    <div key={i} className="egg-cell">
                      <PetIcon pet={e} size={70} />
                      <div style={{ minWidth: 0, overflow: "hidden" }}>
                        <div className="ename">
                          {e.mutations && e.mutations.length > 0
                            ? e.mutations.map((m) => m.toUpperCase()).join(" + ") + " " + displayName(e.category)
                            : displayName(e.category)}
                        </div>
                        {e.rate ? <div className="erate">{fmtRate(e.rate)}</div> : null}
                        {e.weight ? <div className="eweight">{fmtWeight(e.weight)}</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN */}
          <div className="right">
            <div className="right-header">
              <div style={{ width: 18, height: 18, background: "#1e293b", borderRadius: "50%" }} />
              <div className="count">{activePetsSorted.length}/{activeLimit} ACTIVE</div>
              <div className="equip-badge">EQUIP BEST</div>
            </div>

            {rightPanelShown.length > 0 ? (
              <div className="pet-list">
                {rightPanelShown.map((p, i) => (
                  <div key={i} className="pet-row">
                    <PetIcon pet={p} size={48} />
                    <div className="pet-info">
                      <div className="piname">{p.name || displayName(p.category)}</div>
                      <div className="pirate">{fmtRate(p.rate)}</div>
                      {p.weight ? <div className="piweight">{fmtWeight(p.weight)}</div> : null}
                    </div>
                    {eggKeys.has(petKey(p)) && <span className="egg-badge">TELUR</span>}
                    {p.mutations && p.mutations.length > 0 && (
                      <div
                        className="mut-tag"
                        style={{ color: mutColor(p.mutations[0]), borderColor: mutColor(p.mutations[0]) }}
                      >
                        {p.mutations.map((m) => m.toUpperCase()).join(" + ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="pet-list" style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
                Tidak ada pet aktif / menonjol
              </div>
            )}

            {inactiveUnlisted.length > 0 && (
              <div className="inventory-box">
                <div className="inv-label">PET INVENTORY (TIDAK AKTIF)</div>
                <div className="inv-row">
                  <span className="inv-count">+{inactiveUnlisted.length}</span>
                  {inactiveTotalRate > 0 && (
                    <span className="inv-total">total {fmtRate(inactiveTotalRate)}</span>
                  )}
                </div>
              </div>
            )}

            <div className="price-box">
              <div className="price-label">PRICE ACC</div>
              {(price || computeAutoPrice(detail, ratePerB, rateHvPerB)) ? (
                <div className="price-value">{price || computeAutoPrice(detail, ratePerB, rateHvPerB)}</div>
              ) : (
                <div className="price-empty">Isi harga atau rate di controls atas</div>
              )}
            </div>

            {checklist.trim() && (() => {
              const items = checklist.split(",").map((s) => s.trim()).filter(Boolean);
              return items.length > 0 ? (
                <div className="detail-box">
                  <div className="detail-title">DETAIL ACC</div>
                  {items.map((item, i) => (
                    <div key={i} className="detail-item">
                      <div className="detail-check">
                        <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M2 6L5 9L10 3" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <span className="detail-label">{item}</span>
                    </div>
                  ))}
                </div>
              ) : null;
            })()}
          </div>

          {owner.trim() && (
            <div className="watermark-layer">
              <div className="watermark-text">{owner}</div>
              <div className="watermark-sub">FACEBOOK</div>
            </div>
          )}

          {initials && <div className="account-tag">{initials}</div>}
        </div>
      </div>
    </>
  );
}
