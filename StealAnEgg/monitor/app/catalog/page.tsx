"use client";

import { useEffect, useState, useCallback } from "react";
import QRCode from "qrcode";

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
  incomeEggBackpack: number | null;
  incomeEggSedangTumbuh: number | null;
  highValuePetTotal: number | null;
  kandangLevel: number | null;
  treadmillLevel: number | null;
  petsCount: number;
  stolenCount: number;
  mutationToken?: number | null;
  topPets: Pet[];
  online: boolean;
  forSale?: boolean;
  catalogPrice?: number;
  sold?: boolean;
  soldPrice?: number;
  soldAt?: number;
  detail?: {
    activePets?: Pet[];
    allPets?: Pet[];
    growingEggs?: Pet[];
    backpackEggs?: Pet[];
  };
}

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

function fmtRate(v: number): string {
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

function fmtRupiah(v: number): string {
  return "Rp " + v.toLocaleString("id-ID");
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

function deviceBlockStart(num: number | null): number | null {
  if (num === null || isNaN(num)) return null;
  return Math.floor((num - 1) / 10) * 10 + 1;
}

function deviceLabel(name: string): string | null {
  const start = deviceBlockStart(accountNumber(name));
  return start === null ? null : "SAE " + start;
}

function mutColor(mut: string): string {
  const m = mut.toLowerCase();
  if (m.includes("rainbow")) return "#9333ea";
  if (m.includes("golden")) return "#ca8a04";
  if (m.includes("diamond")) return "#2563eb";
  if (m.includes("titanium")) return "#64748b";
  return "#6366f1";
}

function potensi18(a: Account): number {
  const d = a.detail;
  if (!d) return 0;
  const all = [
    ...(d.activePets || []),
    ...(d.allPets || []),
    ...(d.growingEggs || []),
    ...(d.backpackEggs || []),
  ];
  const seen = new Set<string>();
  const deduped: Pet[] = [];
  for (const p of all) {
    const k = `${p.category}|${(p.mutations || []).sort().join("+")}|${p.rate}`;
    if (!seen.has(k)) { seen.add(k); deduped.push(p); }
  }
  deduped.sort((a, b) => (b.rate || 0) - (a.rate || 0));
  let total = 0;
  for (let i = 0; i < Math.min(18, deduped.length); i++) total += deduped[i].rate || 0;
  return total;
}

function highValuePetTotal(a: Account): number {
  const d = a.detail;
  if (!d) return a.highValuePetTotal || 0;
  const all = [
    ...(d.activePets || []),
    ...(d.allPets || []),
    ...(d.growingEggs || []),
    ...(d.backpackEggs || []),
  ];
  return all.reduce((sum, p) => sum + ((p.rate || 0) >= 1_000_000_000 ? (p.rate || 0) : 0), 0);
}

function calcAccountPrice(a: Account, rInc: number, rHv: number, rSpd: number, rTok: number = 0): number {
  const incB = potensi18(a) / 1e9;
  const hvB = highValuePetTotal(a) / 1e9;
  const spdB = (Number(a.speed) || 0) / 1e9;
  const tok = Number(a.mutationToken) || 0;
  const priceValue = Math.round(
    incB * (rInc * 1000) +
    hvB * (rHv * 1000) +
    spdB * (rSpd * 1000) +
    tok * rTok
  );
  return priceValue > 0 ? priceValue : 0;
}

type SortMode = "name" | "speed" | "income" | "money" | "pets" | "eggs" | "potensi" | "akun_baru" | "harga";
type TabMode = "catalog" | "sold";

export default function CatalogPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [soldAccounts, setSoldAccounts] = useState<Account[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [tabMode, setTabMode] = useState<TabMode>("catalog");
  const [actionMsg, setActionMsg] = useState<Record<string, string>>({});

  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [priceEditing, setPriceEditing] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");
  // Live rate inputs INSIDE the edit-price modal -- when set, the modal shows a
  // computed suggested price alongside the manual field so the operator can
  // apply the rate formula per-account (fills 0 if any rate is blank).
  const [editRateInc, setEditRateInc] = useState("");
  const [editRateHv, setEditRateHv] = useState("");
  const [editRateSpd, setEditRateSpd] = useState("");
  const [priceSaving, setPriceSaving] = useState(false);
  const [soldModal, setSoldModal] = useState<string | null>(null);
  const [soldPrice, setSoldPrice] = useState("");
  const [soldLoading, setSoldLoading] = useState(false);
  const [soldError, setSoldError] = useState("");

  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [rateIncome, setRateIncome] = useState("5");
  const [rateHv, setRateHv] = useState("5");
  const [rateSpeed, setRateSpeed] = useState("0");
  // Per-token flat rupiah rate (not scaled by 1000 -- token counts are small).
  const [rateToken, setRateToken] = useState("0");
  const [rateApplying, setRateApplying] = useState(false);

  async function unmarkForSale(account: string) {
    setActionMsg((prev) => ({ ...prev, [account]: "Memproses..." }));
    try {
      const res = await fetch("/api/mark-forsale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, forSale: false }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        setAccounts((prev) => prev.filter((a) => a.sourceAccount !== account));
      } else {
        setActionMsg((prev) => ({ ...prev, [account]: "Gagal: " + (body.error || "unknown") }));
      }
    } catch (e: any) {
      setActionMsg((prev) => ({ ...prev, [account]: "Gagal: " + e.message }));
    }
  }

  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; account: string } | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  // Pre-generate filter modal for rangkuman.
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [summaryFilterPriced, setSummaryFilterPriced] = useState(false);
  const [summaryFilterMutation, setSummaryFilterMutation] = useState(false);
  const [summaryFilterDevice, setSummaryFilterDevice] = useState<string>("all");
  const [summaryFilterMinIncome, setSummaryFilterMinIncome] = useState("");

  // Build + capture a single PNG that lists every catalog account (code | speed |
  // income potensi | total telur | mutasi | harga) with a police-line style
  // watermark and a QR to the seller's Facebook, then trigger download. The
  // whole thing is a temporary offscreen DOM node -- no react tree pollution.
  // Read the current filter state and return the accounts that pass. Kept as
  // a closure so both the modal preview count and the actual capture share
  // the exact same source of truth.
  function filteredSummaryRows(): Account[] {
    const minInc = parseFloat(summaryFilterMinIncome) || 0; // in B (billions)
    return accounts.filter((a) => {
      if (summaryFilterPriced && !(a.catalogPrice && a.catalogPrice > 0)) return false;
      if (summaryFilterMutation && !((a.mutationToken || 0) > 0)) return false;
      if (summaryFilterDevice !== "all" && deviceLabel(a.sourceAccount) !== summaryFilterDevice) return false;
      if (minInc > 0) {
        const potB = potensi18(a) / 1e9;
        if (potB < minInc) return false;
      }
      return true;
    });
  }

  async function downloadSummary() {
    if (summaryBusy) return;
    const rows = filteredSummaryRows().sort((a, b) => {
      const na = accountNumber(a.sourceAccount) ?? 0;
      const nb = accountNumber(b.sourceAccount) ?? 0;
      return na - nb;
    });
    if (rows.length === 0) {
      alert("Tidak ada akun yang cocok dengan filter.");
      return;
    }
    setSummaryModalOpen(false);
    setSummaryBusy(true);
    const totalHarga = rows.reduce((s, a) => s + (a.catalogPrice || 0), 0);

    let qrDataUrl = "";
    try {
      qrDataUrl = await QRCode.toDataURL("https://www.facebook.com/naruaho", {
        width: 220,
        margin: 1,
        color: { dark: "#0f172a", light: "#ffffff" },
      });
    } catch {}

    function eggTotal(a: Account): number {
      const d = a.detail;
      if (d) {
        const g = d.growingEggs?.length || 0;
        const b = d.backpackEggs?.length || 0;
        if (g + b > 0) return g + b;
      }
      return a.stolenCount || 0;
    }

    function accCode(name: string): string {
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

    // 16:9 landscape canvas (1920 x 1080). Header/summary/footer fixed; table
    // gets what remains and each row sizes to fit all accounts. Wider canvas
    // gives Top Pet + Harga real room; shorter canvas caps comfortable capacity
    // around 30 accounts (still fits ~50 with tight rows).
    const CANVAS_W = 1920;
    const CANVAS_H = 1080;
    const HEADER_H = 160;
    const SUMMARY_H = 70;
    const THEAD_H = 46;
    const FOOTER_H = 56;
    const ROWS_AREA_H = CANVAS_H - HEADER_H - SUMMARY_H - FOOTER_H - THEAD_H;
    const idealRowH = Math.floor(ROWS_AREA_H / rows.length);
    const rowH = Math.max(22, Math.min(60, idealRowH));
    const bodyFontSize = Math.max(12, Math.min(22, Math.round(rowH * 0.48)));
    const pillFontSize = Math.max(10, bodyFontSize - 2);
    if (rows.length > 50) {
      const proceed = confirm(`${rows.length} akun cukup banyak buat satu poster 16:9. Tetap generate? Tulisan bakal kecil.`);
      if (!proceed) { setSummaryBusy(false); return; }
    }

    // Pick the pet with the highest rate across every pool the account has
    // (topPets fallback, then full detail). Returns a short label + rate so it
    // fits in one line inside the fixed-height row.
    function topPetLabel(a: Account): { text: string; rate: string; mut: string } {
      const pools: Pet[] = [];
      if (a.topPets) pools.push(...a.topPets);
      if (a.detail) {
        if (a.detail.activePets) pools.push(...a.detail.activePets);
        if (a.detail.allPets) pools.push(...a.detail.allPets);
        if (a.detail.growingEggs) pools.push(...a.detail.growingEggs);
        if (a.detail.backpackEggs) pools.push(...a.detail.backpackEggs);
      }
      const best = pools.sort((x, y) => (y.rate || 0) - (x.rate || 0))[0];
      if (!best) return { text: "—", rate: "", mut: "" };
      const name = best.name || best.category || "?";
      const mut = (best.mutations || [])[0] || "";
      return { text: name, rate: fmtRate(best.rate || 0), mut: mut.toUpperCase() };
    }
    function escHtml(s: string): string {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    const tableRows = rows.map((a, i) => {
      const tp = topPetLabel(a);
      const petCell = tp.text === "—"
        ? "—"
        : `<div class="tp-row">${tp.mut ? `<span class="tp-mut" data-m="${escHtml(tp.mut)}">${escHtml(tp.mut)}</span>` : ""}<span class="tp-name">${escHtml(tp.text)}</span><span class="tp-rate">${tp.rate}</span></div>`;
      return `
      <tr class="${i % 2 === 1 ? "alt" : ""}">
        <td class="c-code">${accCode(a.sourceAccount)}</td>
        <td>${fmtCompact(a.speed)}</td>
        <td>${fmtRate(potensi18(a))}</td>
        <td class="c-toppet">${petCell}</td>
        <td class="c-num">${eggTotal(a)}</td>
        <td class="c-mut">${(a.mutationToken || 0) > 0 ? `<span class="mut-pill">${a.mutationToken}</span>` : "—"}</td>
        <td class="c-price">${a.catalogPrice ? fmtRupiah(a.catalogPrice) : "—"}</td>
      </tr>
    `;
    }).join("");

    // Police-line diagonal stripes overlay: repeated yellow-black tape reading
    // "MAS NARU • JUAL AKUN NARUHUB • DO NOT COPY". Rendered as a background
    // pattern so html2canvas captures it cleanly.
    const container = document.createElement("div");
    container.style.cssText = `position:fixed;left:-9999px;top:0;width:${CANVAS_W}px;height:${CANVAS_H}px;background:#f8fafc;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#0f172a;`;
    container.innerHTML = `
      <style>
        .rk-wrap { position: relative; width: ${CANVAS_W}px; height: ${CANVAS_H}px; overflow: hidden; display: flex; flex-direction: column; }
        .rk-wm {
          position: absolute;
          top: -300px; left: -300px; right: -300px; bottom: -300px;
          pointer-events: none;
          /* z-index above everything so watermark covers the whole layout
             uniformly (header + summary + table + footer). Faint enough that
             table text stays readable. */
          z-index: 20;
          display: flex;
          flex-direction: column;
          gap: 40px;
          padding: 30px 0;
          transform: rotate(-22deg);
        }
        .rk-wm-row {
          display: flex;
          gap: 70px;
          white-space: nowrap;
          justify-content: flex-start;
          padding-left: 0;
        }
        /* Every other row shifts by half a tile so the pattern reads as a
           brick / staggered layout instead of a strict aligned grid. */
        .rk-wm-row.stagger { padding-left: 140px; }
        .rk-wm span {
          /* Mid-tone slate at low alpha shows up as light gray on the dark
             header/footer AND as a soft gray on the white table -- so the tile
             actually covers the whole layout without a second colored copy. */
          color: rgba(120, 130, 155, 0.32);
          font-weight: 900; font-size: 34px; letter-spacing: 4px;
          flex-shrink: 0;
        }
        .rk-header {
          background: linear-gradient(135deg,#0f172a,#1e293b);
          color: #fff; height: ${HEADER_H}px; padding: 22px 36px; display: flex; align-items: center; gap: 18px;
          border-bottom: 4px solid #facc15; flex-shrink: 0; box-sizing: border-box;
        }
        .rk-header h1 { margin: 0; font-size: 34px; font-weight: 900; letter-spacing: 0.5px; }
        .rk-header .sub { color: #cbd5e1; font-size: 14px; margin-top: 8px; letter-spacing: 0.5px; }
        .rk-header .qr { margin-left: auto; background: #fff; padding: 6px; border-radius: 8px; flex-shrink: 0; }
        .rk-header .qr img { display: block; width: 104px; height: 104px; }
        .rk-header .qr-info { color: #f8fafc; font-size: 13px; text-align: right; flex-shrink: 0; }
        .rk-header .qr-info .u { font-weight: 900; font-size: 17px; color: #facc15; }

        .rk-summary {
          height: ${SUMMARY_H}px; padding: 12px 36px; display: flex; gap: 24px; align-items: center;
          background: #eef2f7; border-bottom: 1px solid #cbd5e1; position: relative; z-index: 3;
          flex-shrink: 0; box-sizing: border-box;
        }
        .rk-summary .st { display: flex; flex-direction: column; }
        .rk-summary .st .l { font-size: 12px; color: #64748b; letter-spacing: 1.5px; font-weight: 800; text-transform: uppercase; }
        .rk-summary .st .v { font-size: 22px; font-weight: 900; color: #0f172a; margin-top: 3px; }

        .rk-tblwrap { flex: 1; position: relative; z-index: 3; background: rgba(255,255,255,0.85); overflow: hidden; }
        table.rk-tbl { width: 100%; border-collapse: collapse; table-layout: fixed; }
        table.rk-tbl th {
          background: #0f172a; color: #f8fafc; font-size: 13px; letter-spacing: 1.5px;
          font-weight: 900; text-transform: uppercase; border-bottom: 3px solid #facc15;
          padding: 0 12px; height: ${THEAD_H}px; text-align: left; box-sizing: border-box;
        }
        table.rk-tbl td {
          padding: 0 12px; height: ${rowH}px; border-bottom: 1px solid #e2e8f0;
          font-size: ${bodyFontSize}px; text-align: left; box-sizing: border-box;
          overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
        }
        table.rk-tbl tr.alt td { background: rgba(241, 245, 249, 0.6); }
        table.rk-tbl .c-code { font-weight: 900; color: #1e40af; }
        table.rk-tbl .c-num { text-align: center; font-weight: 700; }
        table.rk-tbl .c-mut { text-align: center; }
        table.rk-tbl .c-price { font-weight: 900; color: #16a34a; text-align: right; }
        .tp-row { display: flex; align-items: center; gap: 6px; overflow: hidden; }
        .tp-name { font-weight: 800; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
        .tp-rate { font-size: ${Math.max(10, bodyFontSize - 3)}px; color: #16a34a; font-weight: 800; margin-left: auto; flex-shrink: 0; }
        .tp-mut { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: ${Math.max(8, bodyFontSize - 5)}px; font-weight: 900; letter-spacing: .5px; background: #e0e7ff; color: #3730a3; flex-shrink: 0; }
        .tp-mut[data-m*="RAINBOW"] { background: linear-gradient(90deg,#fecaca,#fed7aa,#fef08a,#bbf7d0,#bae6fd,#c7d2fe,#e9d5ff); color: #4c1d95; }
        .tp-mut[data-m*="GOLDEN"] { background: #fef3c7; color: #92400e; }
        .tp-mut[data-m*="DIAMOND"] { background: #dbeafe; color: #1e40af; }
        .tp-mut[data-m*="TITANIUM"] { background: #e2e8f0; color: #334155; }
        .mut-pill { display: inline-block; background: #a78bfa; color: #fff; padding: 1px 8px; border-radius: 999px; font-size: ${pillFontSize}px; font-weight: 900; }

        .rk-foot {
          height: ${FOOTER_H}px; padding: 12px 36px; display: flex; align-items: center; justify-content: center;
          text-align: center; background: #0f172a; color: #cbd5e1; font-size: 14px;
          position: relative; z-index: 3; border-top: 2px solid #facc15;
          flex-shrink: 0; box-sizing: border-box;
        }
        .rk-foot strong { color: #facc15; }
      </style>
      <div class="rk-wrap">
        <div class="rk-header">
          <div>
            <h1>Katalog Akun Steal an Egg</h1>
            <div class="sub">Mas Naru — Jual Akun SAE Bergaransi Capcay</div>
          </div>
          <div class="qr">${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR" />` : ""}</div>
          <div class="qr-info">
            <div class="u">Mas Naru</div>
            <div>facebook.com/naruaho</div>
            <div style="margin-top:4px">Scan untuk hubungi</div>
          </div>
        </div>

        <div class="rk-summary">
          <div class="st"><div class="l">Total Akun</div><div class="v">${rows.length}</div></div>
          <div class="st"><div class="l">Terbit</div><div class="v">${fmtDate(Date.now())}</div></div>
        </div>

        <div class="rk-tblwrap">
          <table class="rk-tbl">
            <colgroup>
              <col style="width:11%">
              <col style="width:10%">
              <col style="width:14%">
              <col style="width:22%">
              <col style="width:8%">
              <col style="width:10%">
              <col style="width:25%">
            </colgroup>
            <thead>
              <tr>
                <th>Code</th>
                <th>Speed</th>
                <th>Income Potensi</th>
                <th>Top Pet</th>
                <th style="text-align:center">Telur</th>
                <th style="text-align:center">Token</th>
                <th style="text-align:right">Harga</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>

        <div class="rk-foot">
          Poster resmi dari <strong>Mas Naru</strong> — Kalau tidak ada QR / watermark, itu POSTER PALSU.
        </div>

        <div class="rk-wm">
          ${Array.from({ length: 22 }).map((_, r) => `
            <div class="rk-wm-row ${r % 2 === 1 ? "stagger" : ""}">
              ${Array.from({ length: 12 }).map(() => "<span>MAS NARU</span>").join("")}
            </div>
          `).join("")}
        </div>
      </div>
    `;
    document.body.appendChild(container);

    try {
      // firstElementChild would be the <style> node (empty box -> broken PNG),
      // so grab the actual content wrapper by class instead.
      const target = container.querySelector<HTMLElement>(".rk-wrap");
      if (!target) throw new Error("rangkuman container tidak terbentuk");

      // Wait for the QR <img> (data URL) + first layout pass, then wait for
      // any pending image decodes so the capture never fires before render.
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const imgs = Array.from(target.querySelectorAll("img"));
      await Promise.all(
        imgs.map((img) => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise<void>((res) => {
            img.addEventListener("load", () => res(), { once: true });
            img.addEventListener("error", () => res(), { once: true });
          });
        })
      );
      await new Promise((r) => setTimeout(r, 100));

      // Canvas is fixed 1080x1920 (9:16) so scale=2 gives 2160x3840 -- well
      // within mobile canvas limits. Drop to 1.5 on mobile UAs just in case.
      const isMobile = /Mobi|Android/i.test(navigator.userAgent || "");
      const scale = isMobile ? 1.5 : 2;

      const { default: html2canvas } = await import("html2canvas-pro");
      const canvas = await html2canvas(target, {
        scale,
        backgroundColor: "#f8fafc",
        useCORS: true,
        width: target.offsetWidth,
        height: target.offsetHeight,
        windowWidth: target.offsetWidth,
      });
      if (!canvas.width || !canvas.height) throw new Error("hasil capture kosong");

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      link.download = `Rangkuman-Katalog-MasNaru-${dateStr}.png`;
      link.href = dataUrl;
      // Some Android browsers ignore programmatic download from an offscreen
      // link -- append it first so the click reaches a real handler.
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e: any) {
      alert("Gagal generate rangkuman: " + e.message);
    } finally {
      document.body.removeChild(container);
      setSummaryBusy(false);
    }
  }

  function downloadAllPosters() {
    const withPrice = visible.filter((a) => a.catalogPrice && a.catalogPrice > 0);
    if (withPrice.length === 0) return;
    if (batchProgress) return;
    setBatchProgress({ current: 0, total: withPrice.length, account: "" });

    let idx = 0;
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1200px;height:2000px;border:none;opacity:0;pointer-events:none;";
    document.body.appendChild(iframe);

    function onMessage(ev: MessageEvent) {
      if (ev.data?.type === "poster-ready" || ev.data?.type === "poster-error") {
        if (ev.data.type === "poster-ready" && ev.data.dataUrl) {
          const link = document.createElement("a");
          const digits = (ev.data.account as string).match(/(\d+)$/)?.[1] || "";
          const price = Number(ev.data.price) || 0;
          const priceSuffix = price > 0 ? `-${Math.round(price / 1000)}k` : "";
          link.download = `Blekok-${digits}${priceSuffix}.png`;
          link.href = ev.data.dataUrl;
          link.click();
        }
        idx++;
        if (idx < withPrice.length) {
          loadNext();
        } else {
          window.removeEventListener("message", onMessage);
          document.body.removeChild(iframe);
          setBatchProgress(null);
        }
      }
    }
    window.addEventListener("message", onMessage);

    function loadNext() {
      const a = withPrice[idx];
      setBatchProgress({ current: idx + 1, total: withPrice.length, account: a.sourceAccount });
      iframe.src = `/poster?account=${encodeURIComponent(a.sourceAccount)}&catalogPrice=${a.catalogPrice || 0}&autoDownload=1`;
    }
    loadNext();
  }

  async function saveCatalogPrice(account: string) {
    const val = Number(priceInput);
    if (isNaN(val) || val < 0) return;
    setPriceSaving(true);
    try {
      const res = await fetch("/api/set-catalog-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, price: val }),
      });
      if (res.ok) {
        setAccounts((prev) =>
          prev.map((a) => a.sourceAccount === account ? { ...a, catalogPrice: val } : a)
        );
        setPriceEditing(null);
      }
    } catch {}
    setPriceSaving(false);
  }

  async function applyBulkRates() {
    const rInc = parseFloat(rateIncome) || 0;
    const rHv = parseFloat(rateHv) || 0;
    const rSpd = parseFloat(rateSpeed) || 0;
    const rTok = parseFloat(rateToken) || 0;
    if (rInc <= 0 && rHv <= 0 && rSpd <= 0 && rTok <= 0) {
      alert("Isi minimal salah satu rate!");
      return;
    }
    setRateApplying(true);
    try {
      const updates: { account: string; price: number }[] = [];
      const updatedAccounts = accounts.map((a) => {
        const newPrice = calcAccountPrice(a, rInc, rHv, rSpd, rTok);
        if (newPrice > 0) updates.push({ account: a.sourceAccount, price: newPrice });
        return { ...a, catalogPrice: newPrice > 0 ? newPrice : a.catalogPrice };
      });

      // Save each to Redis
      for (const u of updates) {
        await fetch("/api/set-catalog-price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account: u.account, price: u.price }),
        });
      }
      setAccounts(updatedAccounts);
      setRateModalOpen(false);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setRateApplying(false);
    }
  }

  async function markSold() {
    if (!soldModal) return;
    const price = Number(soldPrice);
    if (isNaN(price) || price <= 0) {
      setSoldError("Masukkan harga yang valid.");
      return;
    }
    setSoldLoading(true);
    setSoldError("");
    try {
      const res = await fetch("/api/mark-sold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: soldModal, price }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        setAccounts((prev) => prev.filter((a) => a.sourceAccount !== soldModal));
        setSoldModal(null);
        setSoldPrice("");
        fetchSoldAccounts();
      } else {
        setSoldError(body.error || "Gagal menandai terjual.");
      }
    } catch (e: any) {
      setSoldError(e.message);
    } finally {
      setSoldLoading(false);
    }
  }

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/catalog-accounts");
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch {}
  }, []);

  const fetchSoldAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/sold-accounts");
      const data = await res.json();
      setSoldAccounts(data.accounts || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchAccounts();
    fetchSoldAccounts();
    const id = setInterval(() => {
      fetchAccounts();
      fetchSoldAccounts();
    }, 10000);
    return () => clearInterval(id);
  }, [fetchAccounts, fetchSoldAccounts]);

  function filtered(): Account[] {
    let list = tabMode === "catalog" ? [...accounts] : [...soldAccounts];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (a) =>
          a.sourceAccount.toLowerCase().includes(q) ||
          (deviceLabel(a.sourceAccount) || "").toLowerCase().includes(q)
      );
    }
    const minP = Number(minPrice) * 1000;
    if (minP > 0) {
      if (tabMode === "catalog") {
        list = list.filter((a) => (a.catalogPrice || 0) >= minP);
      } else {
        list = list.filter((a) => (a.soldPrice || 0) >= minP);
      }
    }
    const maxP = Number(maxPrice) * 1000;
    if (maxP > 0) {
      if (tabMode === "catalog") {
        list = list.filter((a) => (a.catalogPrice || 0) > 0 && (a.catalogPrice || 0) <= maxP);
      } else {
        list = list.filter((a) => (a.soldPrice || 0) > 0 && (a.soldPrice || 0) <= maxP);
      }
    }
    if (tabMode === "sold") {
      list.sort((a, b) => (b.soldAt || 0) - (a.soldAt || 0));
      return list;
    }
    switch (sortMode) {
      case "speed":
        list.sort((a, b) => (Number(b.speed) || 0) - (Number(a.speed) || 0));
        break;
      case "income":
        list.sort((a, b) => (Number(b.incomeAktif) || 0) - (Number(a.incomeAktif) || 0));
        break;
      case "money":
        list.sort((a, b) => (Number(b.money) || 0) - (Number(a.money) || 0));
        break;
      case "pets":
        list.sort((a, b) => (b.petsCount || 0) - (a.petsCount || 0));
        break;
      case "eggs":
        list.sort((a, b) => (b.stolenCount || 0) - (a.stolenCount || 0));
        break;
      case "potensi":
        list.sort((a, b) => potensi18(b) - potensi18(a));
        break;
      case "akun_baru":
        list = list.filter((a) => (a.treadmillLevel ?? -1) === 1);
        list.sort((a, b) => potensi18(b) - potensi18(a));
        break;
      case "harga":
        list.sort((a, b) => (b.catalogPrice || 0) - (a.catalogPrice || 0));
        break;
      default:
        list.sort((a, b) => {
          const na = accountNumber(a.sourceAccount);
          const nb = accountNumber(b.sourceAccount);
          if (na !== null && nb !== null) return na - nb;
          return a.sourceAccount.localeCompare(b.sourceAccount);
        });
    }
    return list;
  }

  const visible = filtered();
  const activeList = tabMode === "catalog" ? accounts : soldAccounts;
  const onlineCount = activeList.filter((a) => a.online).length;
  const totalMoney = activeList.reduce((s, a) => s + (Number(a.money) || 0), 0);
  const totalSpeed = activeList.reduce((s, a) => s + (Number(a.speed) || 0), 0);
  const totalPets = activeList.reduce((s, a) => s + (a.petsCount || 0), 0);
  const totalStolen = activeList.reduce((s, a) => s + (a.stolenCount || 0), 0);
  const totalSoldRevenue = soldAccounts.reduce((s, a) => s + (a.soldPrice || 0), 0);
  const estimasiPendapatan = accounts.reduce((s, a) => s + (a.catalogPrice || 0), 0);

  const previewIncRate = parseFloat(rateIncome) || 0;
  const previewHvRate = parseFloat(rateHv) || 0;
  const previewSpeedRate = parseFloat(rateSpeed) || 0;
  const previewTotalRev = accounts.reduce((sum, a) => sum + calcAccountPrice(a, previewIncRate, previewHvRate, previewSpeedRate), 0);
  const previewPricedCount = accounts.filter((a) => calcAccountPrice(a, previewIncRate, previewHvRate, previewSpeedRate) > 0).length;

  return (
    <div>
      <style>{`
        :root {
          --bg: #0b0b12; --card: #14141f; --card-border: #262636;
          --ink: #e8e8f0; --dim: #8b8ba3; --accent: #a78bfa; --accent2: #22d3ee;
          --green: #34d399; --gold: #fbbf24; --red: #f87171;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); color: var(--ink); font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }

        .topbar {
          background: var(--card); border-bottom: 1px solid var(--card-border);
          padding: 16px 28px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
          position: sticky; top: 0; z-index: 50;
        }
        .topbar h1 { font-size: 20px; color: var(--ink); }

        .tab-bar {
          display: flex; gap: 0; padding: 0 28px; margin-top: 12px;
        }
        .tab-btn {
          background: var(--card); color: var(--dim); border: 1px solid var(--card-border);
          border-bottom: none; border-radius: 10px 10px 0 0;
          padding: 10px 24px; font-size: 13px; font-weight: 700; cursor: pointer;
          transition: all .15s;
        }
        .tab-btn.active { background: var(--bg); color: var(--ink); border-color: var(--accent); border-bottom: 1px solid var(--bg); }
        .tab-btn .tab-badge {
          display: inline-block; background: var(--accent); color: #1a1030;
          font-size: 10px; font-weight: 800; border-radius: 8px; padding: 1px 7px; margin-left: 8px;
        }
        .tab-btn.sold-tab .tab-badge { background: var(--red); color: #fff; }

        .controls {
          padding: 16px 28px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        }
        .controls label { color: var(--dim); font-size: 12px; font-weight: 700; }
        .controls select, .controls input {
          background: var(--card); color: var(--ink); border: 1px solid var(--card-border);
          border-radius: 8px; padding: 6px 10px; font-size: 12px; font-weight: 700;
        }
        .controls select:focus, .controls input:focus { outline: none; border-color: var(--accent); }
        .viewtoggle {
          margin-left: auto; display: flex; gap: 4px;
        }
        .viewtoggle button {
          background: var(--card); color: var(--dim); border: 1px solid var(--card-border);
          border-radius: 6px; padding: 5px 10px; font-size: 12px; font-weight: 700; cursor: pointer;
        }
        .viewtoggle button.active { background: var(--accent); color: #1a1030; border-color: var(--accent); }

        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; padding: 0 28px 16px; }
        .scard { background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 12px 14px; }
        .scard .slabel { color: var(--dim); font-size: 10px; font-weight: 700; letter-spacing: .5px; }
        .scard .sval { font-size: 22px; font-weight: 800; margin-top: 4px; }

        .catalog-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px; padding: 0 28px 28px;
        }
        .catalog-card {
          background: var(--card); border: 1px solid var(--card-border); border-radius: 16px;
          padding: 20px; transition: border-color .15s; position: relative; overflow: hidden;
        }
        .catalog-card:hover { border-color: var(--accent); }
        .catalog-card.sold-card { opacity: 1; }
        .catalog-card.sold-card .sold-overlay {
          position: absolute; inset: 0; background: rgba(20, 20, 31, 0.75);
          display: flex; align-items: center; justify-content: center;
          z-index: 10; pointer-events: none;
        }
        .sold-watermark {
          border: 4px solid var(--red); border-radius: 12px; padding: 12px 32px;
          transform: rotate(-18deg);
        }
        .sold-watermark span {
          font-size: 36px; font-weight: 900; color: var(--red); letter-spacing: 6px;
          text-transform: uppercase;
        }
        .cc-head { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
        .cc-dot { width: 10px; height: 10px; border-radius: 50%; }
        .cc-dot.on { background: var(--green); box-shadow: 0 0 6px var(--green); }
        .cc-dot.off { background: #555; }
        .cc-name { font-size: 18px; font-weight: 800; }
        .cc-device { color: var(--accent2); font-size: 10px; font-weight: 700; background: #1c1c2b; border: 1px solid var(--card-border); border-radius: 6px; padding: 2px 6px; }
        .cc-status { margin-left: auto; font-size: 11px; color: var(--dim); }

        .cc-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 14px; }
        .cc-stat .cslabel { font-size: 10px; font-weight: 700; color: var(--dim); }
        .cc-stat .csval { font-size: 16px; font-weight: 700; }
        .cc-stat.speed .csval { color: var(--accent); }
        .cc-stat.money .csval { color: var(--gold); }
        .cc-stat.income .csval { color: var(--green); }

        .cc-pets { display: flex; gap: 6px; overflow-x: auto; margin-bottom: 14px; }
        .cc-pet {
          background: #1c1c2b; border: 1px solid var(--card-border); border-radius: 8px;
          padding: 4px 8px; text-align: center; min-width: 80px; flex-shrink: 0;
        }
        .cc-pet .cpname { font-size: 10px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 72px; }
        .cc-pet .cprate { font-size: 10px; color: var(--gold); font-weight: 700; }
        .cc-pet .cpmut { font-size: 8px; font-weight: 700; }

        .btn-download-all {
          background: #8b5cf6; color: #fff; border: none; border-radius: 10px;
          padding: 10px 24px; font-size: 13px; font-weight: 800; cursor: pointer;
        }
        .btn-download-all:hover { filter: brightness(1.1); }
        .btn-download-all:disabled { opacity: .6; cursor: not-allowed; }

        .cc-price-row {
          padding: 0 16px 8px;
        }
        .cc-price-btn {
          background: none; border: 1px dashed var(--card-border); border-radius: 8px;
          color: var(--accent); font-size: 13px; font-weight: 800; padding: 6px 12px;
          cursor: pointer; width: 100%; text-align: center;
        }
        .cc-price-btn:hover { border-color: var(--accent); background: rgba(250,204,21,0.05); }

        .cc-actions { display: flex; gap: 8px; }
        .cc-actions a, .cc-actions button {
          flex: 1; text-align: center; padding: 8px; border-radius: 8px;
          font-size: 12px; font-weight: 800; text-decoration: none; cursor: pointer;
          border: none;
        }
        .btn-poster { background: var(--accent); color: #1a1030; }
        .btn-poster:hover { filter: brightness(1.1); }
        .btn-detail { background: #262636; color: var(--ink); border: 1px solid var(--card-border) !important; }
        .btn-detail:hover { border-color: var(--accent2) !important; }
        .btn-sold { background: var(--red); color: #fff; }
        .btn-sold:hover { filter: brightness(1.1); }

        .sold-price-badge {
          position: absolute; top: 12px; right: 12px; z-index: 15;
          background: var(--red); color: #fff; font-size: 12px; font-weight: 800;
          padding: 4px 12px; border-radius: 8px;
        }
        .sold-date-badge {
          position: absolute; top: 12px; left: 12px; z-index: 15;
          background: rgba(30, 30, 50, 0.9); color: var(--dim); font-size: 10px; font-weight: 700;
          padding: 3px 10px; border-radius: 6px;
        }

        .catalog-table { width: 100%; border-collapse: collapse; margin: 0 28px 28px; max-width: calc(100% - 56px); }
        .catalog-table th {
          background: var(--card); color: var(--dim); font-size: 11px; font-weight: 700;
          text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--card-border);
          position: sticky; top: 56px;
        }
        .catalog-table td {
          padding: 10px 12px; border-bottom: 1px solid var(--card-border); font-size: 13px;
        }
        .catalog-table tr:hover td { background: rgba(167, 139, 250, .05); }
        .catalog-table .tname { font-weight: 800; }
        .catalog-table .tonline { color: var(--green); }
        .catalog-table .toffline { color: #555; }
        .catalog-table a { color: var(--accent); text-decoration: none; font-weight: 700; }
        .catalog-table a:hover { text-decoration: underline; }
        .catalog-table .tsold { color: var(--red); font-weight: 800; }

        .empty { color: var(--dim); text-align: center; padding: 60px 28px; font-size: 14px; }

        .modal-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100;
          display: flex; align-items: center; justify-content: center;
        }
        .modal-box {
          background: var(--card); border: 1px solid var(--card-border); border-radius: 16px;
          padding: 28px; width: 400px; max-width: 90vw;
        }
        .modal-box h2 { font-size: 18px; margin-bottom: 6px; }
        .modal-box .modal-sub { color: var(--dim); font-size: 12px; margin-bottom: 20px; }
        .modal-box label { color: var(--dim); font-size: 12px; font-weight: 700; display: block; margin-bottom: 6px; }
        .modal-box input {
          width: 100%; background: var(--bg); color: var(--ink); border: 1px solid var(--card-border);
          border-radius: 8px; padding: 10px 14px; font-size: 16px; font-weight: 700;
          margin-bottom: 16px;
        }
        .modal-box input:focus { outline: none; border-color: var(--accent); }
        .modal-actions { display: flex; gap: 10px; }
        .modal-actions button {
          flex: 1; padding: 10px; border-radius: 8px; font-size: 13px; font-weight: 800;
          cursor: pointer; border: none;
        }
        .modal-actions .btn-confirm { background: var(--red); color: #fff; }
        .modal-actions .btn-confirm:hover { filter: brightness(1.1); }
        .modal-actions .btn-confirm:disabled { opacity: .5; cursor: not-allowed; }
        .modal-actions .btn-cancel { background: #262636; color: var(--ink); }
        .modal-error { color: var(--red); font-size: 12px; margin-bottom: 10px; }
      `}</style>

      <div className="topbar">
        <h1>Katalog Akun</h1>
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>
          {tabMode === "catalog"
            ? `${accounts.length} akun (${onlineCount} online)`
            : `${soldAccounts.length} akun terjual`}
        </span>
      </div>

      <div className="tab-bar">
        <button
          className={`tab-btn ${tabMode === "catalog" ? "active" : ""}`}
          onClick={() => setTabMode("catalog")}
        >
          Katalog
          <span className="tab-badge">{accounts.length}</span>
        </button>
        <button
          className={`tab-btn sold-tab ${tabMode === "sold" ? "active" : ""}`}
          onClick={() => setTabMode("sold")}
        >
          Terjual
          <span className="tab-badge">{soldAccounts.length}</span>
        </button>
      </div>

      <div className="controls">
        {tabMode === "catalog" && (
          <>
            <label>Urutkan:</label>
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
              <option value="name">Nama (Nomor)</option>
              <option value="speed">Speed Tertinggi</option>
              <option value="income">Income Tertinggi</option>
              <option value="money">Cash Terbanyak</option>
              <option value="pets">Pet Terbanyak</option>
              <option value="eggs">Egg Stolen Terbanyak</option>
              <option value="potensi">Potensi 18 Pet</option>
              <option value="akun_baru">Akun Baru (Kandang 0)</option>
              <option value="harga">Harga Tertinggi</option>
            </select>
          </>
        )}
        <label>Cari:</label>
        <input
          type="text"
          placeholder="Nama akun / device..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: 200 }}
        />
        <label>Harga {"≥"}:</label>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "var(--dim)", fontSize: 12, fontWeight: 700 }}>Rp</span>
          <input
            type="number"
            placeholder="0"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            style={{ width: 80 }}
          />
          <span style={{ color: "var(--dim)", fontSize: 11 }}>.000</span>
        </div>
        <label>Harga {"≤"}:</label>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "var(--dim)", fontSize: 12, fontWeight: 700 }}>Rp</span>
          <input
            type="number"
            placeholder="0"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            style={{ width: 80 }}
          />
          <span style={{ color: "var(--dim)", fontSize: 11 }}>.000</span>
        </div>
        <div className="viewtoggle">
          <button className={viewMode === "grid" ? "active" : ""} onClick={() => setViewMode("grid")}>
            Grid
          </button>
          <button className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>
            Tabel
          </button>
        </div>
      </div>

      {tabMode === "catalog" ? (
        <div className="summary">
          <div className="scard">
            <div className="slabel">TOTAL AKUN</div>
            <div className="sval">{visible.length}</div>
          </div>
          <div className="scard">
            <div className="slabel">ESTIMASI PENDAPATAN</div>
            <div className="sval" style={{ color: "var(--green)" }}>{fmtRupiah(estimasiPendapatan)}</div>
          </div>
          <div className="scard">
            <div className="slabel">SUDAH ADA HARGA</div>
            <div className="sval" style={{ color: "var(--accent)" }}>{accounts.filter((a) => a.catalogPrice && a.catalogPrice > 0).length}</div>
          </div>
        </div>
      ) : (
        <div className="summary">
          <div className="scard">
            <div className="slabel">AKUN TERJUAL</div>
            <div className="sval">{soldAccounts.length}</div>
          </div>
          <div className="scard">
            <div className="slabel">TOTAL PENDAPATAN</div>
            <div className="sval" style={{ color: "var(--green)" }}>{fmtRupiah(totalSoldRevenue)}</div>
          </div>
          <div className="scard">
            <div className="slabel">RATA-RATA HARGA</div>
            <div className="sval" style={{ color: "var(--gold)" }}>
              {soldAccounts.length > 0 ? fmtRupiah(Math.round(totalSoldRevenue / soldAccounts.length)) : "Rp 0"}
            </div>
          </div>
        </div>
      )}

      {tabMode === "catalog" && (
        <div style={{ padding: "0 28px 12px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            className="btn-download-all"
            style={{ background: "var(--accent)", color: "#1a1030" }}
            onClick={() => setRateModalOpen(true)}
          >
            ⚡ Set Rate & Hitung Harga Massal
          </button>
          <button
            className="btn-download-all"
            style={{ background: "#facc15", color: "#0f172a" }}
            onClick={() => setSummaryModalOpen(true)}
            disabled={summaryBusy || accounts.length === 0}
            title="Download PNG rangkuman akun (pilih filter dulu)"
          >
            {summaryBusy ? "Generating..." : `📋 Download Rangkuman (${accounts.length} akun)`}
          </button>
          {visible.some((a) => a.catalogPrice && a.catalogPrice > 0) && (
            <button
              className="btn-download-all"
              onClick={downloadAllPosters}
              disabled={!!batchProgress}
            >
              {batchProgress
                ? `Generating ${batchProgress.current}/${batchProgress.total} — ${batchProgress.account}`
                : `Download All Poster (${visible.filter((a) => a.catalogPrice && a.catalogPrice > 0).length} akun)`}
            </button>
          )}
          {batchProgress && (
            <div style={{ flex: 1, maxWidth: 200, height: 6, background: "#262636", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%`, height: "100%", background: "#8b5cf6", borderRadius: 3, transition: "width .3s" }} />
            </div>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="empty">
          {tabMode === "catalog"
            ? accounts.length > 0
              ? "Ga ada akun yang cocok dengan pencarian."
              : "Belum ada akun di katalog."
            : soldAccounts.length > 0
              ? "Ga ada akun terjual yang cocok dengan pencarian."
              : "Belum ada akun yang terjual."}
        </div>
      ) : viewMode === "grid" ? (
        <div className="catalog-grid">
          {visible.map((a) => (
            <div key={a.sourceAccount} className={`catalog-card ${a.sold ? "sold-card" : ""}`}>
              {a.sold && (
                <>
                  <div className="sold-overlay">
                    <div className="sold-watermark">
                      <span>TERJUAL</span>
                    </div>
                  </div>
                  <div className="sold-price-badge">{fmtRupiah(a.soldPrice || 0)}</div>
                  {a.soldAt && <div className="sold-date-badge">{fmtDate(a.soldAt)}</div>}
                </>
              )}

              <div className="cc-head">
                <span className={`cc-dot ${a.online ? "on" : "off"}`} />
                <span className="cc-name">{a.sourceAccount}</span>
                {deviceLabel(a.sourceAccount) && (
                  <span className="cc-device">{deviceLabel(a.sourceAccount)}</span>
                )}
                <span className="cc-status">{a.online ? "Online" : "Offline"}</span>
              </div>

              <div className="cc-stats">
                <div className="cc-stat speed">
                  <div className="cslabel">SPEED</div>
                  <div className="csval">{fmtCompact(a.speed)}</div>
                </div>
                <div className="cc-stat money">
                  <div className="cslabel">CASH</div>
                  <div className="csval">{fmtMoney(a.money)}</div>
                </div>
                <div className="cc-stat income">
                  <div className="cslabel">INCOME AKTIF</div>
                  <div className="csval">{fmtMoney(a.incomeAktif)}/s</div>
                </div>
                <div className="cc-stat">
                  <div className="cslabel">PET &gt;= 1B/S</div>
                  <div className="csval">{fmtMoney(a.highValuePetTotal)}</div>
                </div>
                <div className="cc-stat">
                  <div className="cslabel">PETS</div>
                  <div className="csval">{a.petsCount}</div>
                </div>
                <div className="cc-stat">
                  <div className="cslabel">EGGS STOLEN</div>
                  <div className="csval">{a.stolenCount}</div>
                </div>
              </div>

              {(a.topPets || []).length > 0 && (
                <div className="cc-pets">
                  {a.topPets.slice(0, 5).map((p, i) => (
                    <div key={i} className="cc-pet">
                      <div className="cpname">{p.name || p.category}</div>
                      <div className="cprate">{fmtRate(p.rate)}</div>
                      {p.mutations && p.mutations.length > 0 && (
                        <div className="cpmut" style={{ color: mutColor(p.mutations[0]) }}>
                          {p.mutations.map((m) => m.toUpperCase()).join("+")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!a.sold && (
                <div className="cc-price-row">
                  <button
                    className="cc-price-btn"
                    onClick={() => {
                      setPriceEditing(a.sourceAccount);
                      setPriceInput(String(a.catalogPrice || ""));
                      // Seed rate fields from the last bulk-rate values so the
                      // per-account modal picks up where the operator left off.
                      setEditRateInc(rateIncome);
                      setEditRateHv(rateHv);
                      setEditRateSpd(rateSpeed);
                    }}
                  >
                    {a.catalogPrice ? fmtRupiah(a.catalogPrice) : "Set Harga"}
                  </button>
                </div>
              )}

              <div className="cc-actions" style={{ position: "relative", zIndex: 15 }}>
                <a
                  className="btn-poster"
                  href={`/poster?account=${encodeURIComponent(a.sourceAccount)}${a.sold ? `&sold=1&soldPrice=${a.soldPrice || 0}` : ""}${a.catalogPrice ? `&catalogPrice=${a.catalogPrice}` : ""}`}
                >
                  {a.sold ? "Poster Terjual" : "Generate Poster"}
                </a>
                {!a.sold && (
                  <>
                    <button
                      className="btn-sold"
                      onClick={() => {
                        setSoldModal(a.sourceAccount);
                        setSoldPrice(String(a.catalogPrice || ""));
                        setSoldError("");
                      }}
                    >
                      Terjual
                    </button>
                    <button
                      className="btn-detail"
                      onClick={() => unmarkForSale(a.sourceAccount)}
                    >
                      Kembalikan
                    </button>
                  </>
                )}
              </div>
              {actionMsg[a.sourceAccount] && (
                <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>{actionMsg[a.sourceAccount]}</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <table className="catalog-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Akun</th>
              <th>Device</th>
              <th>Speed</th>
              <th>Cash</th>
              <th>Income Aktif</th>
              <th>Pet &gt;= 1B/s</th>
              <th>Pets</th>
              <th>Stolen</th>
              <th>Top Pet</th>
              <th>Harga</th>
              {tabMode === "sold" && <th>Tanggal</th>}
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => (
              <tr key={a.sourceAccount}>
                <td>
                  {a.sold ? (
                    <span className="tsold">TERJUAL</span>
                  ) : (
                    <span className={a.online ? "tonline" : "toffline"}>
                      {a.online ? "●" : "○"}
                    </span>
                  )}
                </td>
                <td className="tname">{a.sourceAccount}</td>
                <td style={{ color: "var(--accent2)", fontSize: 11 }}>
                  {deviceLabel(a.sourceAccount) || "-"}
                </td>
                <td style={{ color: "var(--accent)" }}>{fmtCompact(a.speed)}</td>
                <td style={{ color: "var(--gold)" }}>{fmtMoney(a.money)}</td>
                <td style={{ color: "var(--green)" }}>{fmtMoney(a.incomeAktif)}/s</td>
                <td>{fmtMoney(a.highValuePetTotal)}</td>
                <td>{a.petsCount}</td>
                <td>{a.stolenCount}</td>
                <td style={{ fontSize: 11 }}>
                  {a.topPets?.[0]
                    ? `${a.topPets[0].name || a.topPets[0].category} (${fmtRate(a.topPets[0].rate)})`
                    : "-"}
                </td>
                <td style={{ color: tabMode === "sold" ? "var(--red)" : "var(--accent)", fontWeight: 700, fontSize: 12 }}>
                  {tabMode === "sold"
                    ? fmtRupiah(a.soldPrice || 0)
                    : a.catalogPrice ? fmtRupiah(a.catalogPrice) : "-"}
                </td>
                {tabMode === "sold" && (
                  <td style={{ color: "var(--dim)", fontSize: 11 }}>
                    {a.soldAt ? fmtDate(a.soldAt) : "-"}
                  </td>
                )}
                <td style={{ display: "flex", gap: 8 }}>
                  {a.sold ? (
                    <a href={`/poster?account=${encodeURIComponent(a.sourceAccount)}&sold=1&soldPrice=${a.soldPrice || 0}`}>Poster</a>
                  ) : (
                    <>
                      <a href={`/poster?account=${encodeURIComponent(a.sourceAccount)}${a.catalogPrice ? `&catalogPrice=${a.catalogPrice}` : ""}`}>Poster</a>
                      <button
                        onClick={() => {
                          setSoldModal(a.sourceAccount);
                          setSoldPrice(String(a.catalogPrice || ""));
                          setSoldError("");
                        }}
                        style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
                      >
                        Terjual
                      </button>
                      <button
                        onClick={() => unmarkForSale(a.sourceAccount)}
                        style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
                      >
                        Kembalikan
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {summaryModalOpen && (() => {
        const devices = Array.from(
          new Set(accounts.map((a) => deviceLabel(a.sourceAccount)).filter((d): d is string => !!d))
        ).sort((a, b) => {
          const na = parseInt(a.match(/\d+/)?.[0] || "0", 10);
          const nb = parseInt(b.match(/\d+/)?.[0] || "0", 10);
          return na - nb;
        });
        const previewCount = filteredSummaryRows().length;
        return (
          <div className="modal-backdrop" onClick={() => { if (!summaryBusy) setSummaryModalOpen(false); }}>
            <div className="modal-box" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
              <h2>Filter Rangkuman</h2>
              <div className="modal-sub">
                Pilih akun mana yang mau dimasukin ke poster rangkuman. Dari <strong>{accounts.length} akun</strong> di katalog, <strong style={{ color: "var(--accent)" }}>{previewCount} akun</strong> lolos filter.
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={summaryFilterPriced}
                  onChange={(e) => setSummaryFilterPriced(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 700 }}>Cuma yang udah punya harga</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={summaryFilterMutation}
                  onChange={(e) => setSummaryFilterMutation(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 700 }}>Cuma yang punya token mutasi</span>
              </label>

              <label>Filter Device</label>
              <select
                value={summaryFilterDevice}
                onChange={(e) => setSummaryFilterDevice(e.target.value)}
                style={{ width: "100%", background: "#1c1c2b", color: "var(--ink)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "8px 10px", fontSize: 13, marginBottom: 14, fontWeight: 700 }}
              >
                <option value="all">Semua device</option>
                {devices.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              <label>Min Income Potensi (B/s)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <input
                  type="number"
                  step="0.5"
                  placeholder="0"
                  value={summaryFilterMinIncome}
                  onChange={(e) => setSummaryFilterMinIncome(e.target.value)}
                  style={{ margin: 0 }}
                />
                <span style={{ color: "var(--dim)", fontSize: 12, fontWeight: 700 }}>B/s</span>
              </div>
              <div style={{ color: "var(--dim)", fontSize: 11, marginBottom: 16 }}>
                Kosongin buat gak filter income.
              </div>

              <div className="modal-actions">
                <button
                  className="btn-cancel"
                  onClick={() => {
                    setSummaryFilterPriced(false);
                    setSummaryFilterMutation(false);
                    setSummaryFilterDevice("all");
                    setSummaryFilterMinIncome("");
                  }}
                  disabled={summaryBusy}
                  style={{ background: "#262636" }}
                >
                  Reset
                </button>
                <button
                  className="btn-confirm"
                  style={{ background: "#facc15", color: "#0f172a" }}
                  onClick={downloadSummary}
                  disabled={summaryBusy || previewCount === 0}
                >
                  {summaryBusy ? "Generating..." : `Generate (${previewCount} akun)`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {rateModalOpen && (() => {
        const rInc = parseFloat(rateIncome) || 0;
        const rHv = parseFloat(rateHv) || 0;
        const rSpd = parseFloat(rateSpeed) || 0;
        const rTok = parseFloat(rateToken) || 0;
        const preview = accounts
          .slice()
          .sort((a, b) => {
            const na = accountNumber(a.sourceAccount) ?? 0;
            const nb = accountNumber(b.sourceAccount) ?? 0;
            return na - nb;
          })
          .map((a) => ({ acc: a, price: calcAccountPrice(a, rInc, rHv, rSpd, rTok) }));
        const totalPreview = preview.reduce((s, p) => s + p.price, 0);
        const pricedCount = preview.filter((p) => p.price > 0).length;
        return (
          <div className="modal-backdrop" onClick={() => { if (!rateApplying) setRateModalOpen(false); }}>
            <div className="modal-box" style={{ width: 720, maxHeight: "88vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
              <h2>Edit All Harga — Rate Calculator</h2>
              <div className="modal-sub">
                Set rate, langsung liat harga per akun di preview. Terapkan sekali klik ke <strong>{accounts.length} akun</strong>.
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label>Rate Income Potensi / 1B</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "var(--dim)", fontSize: 12, fontWeight: 700 }}>Rp</span>
                    <input
                      type="number"
                      step="0.5"
                      placeholder="5"
                      value={rateIncome}
                      onChange={(e) => setRateIncome(e.target.value)}
                      style={{ margin: 0 }}
                    />
                    <span style={{ color: "var(--dim)", fontSize: 11, fontWeight: 700 }}>k/1B</span>
                  </div>
                </div>

                <div>
                  <label>Rate High-Value Pet / 1B</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "var(--dim)", fontSize: 12, fontWeight: 700 }}>Rp</span>
                    <input
                      type="number"
                      step="0.5"
                      placeholder="0"
                      value={rateHv}
                      onChange={(e) => setRateHv(e.target.value)}
                      style={{ margin: 0 }}
                    />
                    <span style={{ color: "var(--dim)", fontSize: 11, fontWeight: 700 }}>k/1B</span>
                  </div>
                </div>

                <div>
                  <label>Rate Speed / 1B</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "var(--dim)", fontSize: 12, fontWeight: 700 }}>Rp</span>
                    <input
                      type="number"
                      step="0.5"
                      placeholder="0"
                      value={rateSpeed}
                      onChange={(e) => setRateSpeed(e.target.value)}
                      style={{ margin: 0 }}
                    />
                    <span style={{ color: "var(--dim)", fontSize: 11, fontWeight: 700 }}>k/1B</span>
                  </div>
                </div>

                <div>
                  <label>Rate Token Mutasi</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "var(--dim)", fontSize: 12, fontWeight: 700 }}>Rp</span>
                    <input
                      type="number"
                      step="100"
                      placeholder="0"
                      value={rateToken}
                      onChange={(e) => setRateToken(e.target.value)}
                      style={{ margin: 0 }}
                    />
                    <span style={{ color: "var(--dim)", fontSize: 11, fontWeight: 700 }}>/ token</span>
                  </div>
                </div>
              </div>

              <div style={{ background: "#1c1c2b", border: "1px solid var(--card-border)", borderRadius: 10, padding: "10px 14px", marginBottom: 10, fontSize: 12, display: "flex", justifyContent: "space-between", gap: 20 }}>
                <div><span style={{ color: "var(--dim)" }}>Total: </span><strong style={{ color: "var(--green)" }}>{fmtRupiah(totalPreview)}</strong></div>
                <div><span style={{ color: "var(--dim)" }}>Akun dapat harga: </span><strong style={{ color: "var(--accent)" }}>{pricedCount}/{accounts.length}</strong></div>
              </div>

              <div style={{ flex: 1, overflow: "auto", border: "1px solid var(--card-border)", borderRadius: 10, background: "#0d0d15", marginBottom: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead style={{ position: "sticky", top: 0, background: "#151521", zIndex: 1 }}>
                    <tr>
                      <th style={{ textAlign: "left", padding: "8px 10px", color: "var(--dim)", fontSize: 10, letterSpacing: 1, borderBottom: "1px solid var(--card-border)" }}>AKUN</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", color: "var(--dim)", fontSize: 10, letterSpacing: 1, borderBottom: "1px solid var(--card-border)" }}>SPEED</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", color: "var(--dim)", fontSize: 10, letterSpacing: 1, borderBottom: "1px solid var(--card-border)" }}>POTENSI 18</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", color: "var(--dim)", fontSize: 10, letterSpacing: 1, borderBottom: "1px solid var(--card-border)" }}>HV</th>
                      <th style={{ textAlign: "center", padding: "8px 10px", color: "var(--dim)", fontSize: 10, letterSpacing: 1, borderBottom: "1px solid var(--card-border)" }}>TOKEN</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", color: "var(--dim)", fontSize: 10, letterSpacing: 1, borderBottom: "1px solid var(--card-border)" }}>SEBELUM</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", color: "var(--dim)", fontSize: 10, letterSpacing: 1, borderBottom: "1px solid var(--card-border)" }}>SESUDAH</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map(({ acc, price }) => {
                      const changed = (acc.catalogPrice || 0) !== price && price > 0;
                      return (
                        <tr key={acc.sourceAccount} style={{ borderBottom: "1px solid #1a1a25" }}>
                          <td style={{ padding: "6px 10px", fontWeight: 700 }}>{acc.sourceAccount}</td>
                          <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--dim)" }}>{fmtCompact(acc.speed)}</td>
                          <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--dim)" }}>{fmtRate(potensi18(acc))}</td>
                          <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--dim)" }}>{fmtRate(highValuePetTotal(acc))}</td>
                          <td style={{ padding: "6px 10px", textAlign: "center", color: (acc.mutationToken || 0) > 0 ? "var(--accent)" : "var(--dim)", fontWeight: 800 }}>{acc.mutationToken || 0}</td>
                          <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--dim)" }}>{acc.catalogPrice ? fmtRupiah(acc.catalogPrice) : "—"}</td>
                          <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 900, color: price > 0 ? (changed ? "#4ade80" : "var(--ink)") : "var(--dim)" }}>
                            {price > 0 ? fmtRupiah(price) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setRateModalOpen(false)} disabled={rateApplying}>
                  Batal
                </button>
                <button
                  className="btn-confirm"
                  style={{ background: "var(--accent)", color: "#1a1030" }}
                  onClick={applyBulkRates}
                  disabled={rateApplying || pricedCount === 0}
                >
                  {rateApplying ? "Menghitung & Menyimpan..." : `Terapkan ke ${pricedCount} Akun`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {priceEditing && (() => {
        const editingAcc = accounts.find((a) => a.sourceAccount === priceEditing);
        if (!editingAcc) return null;
        const rInc = parseFloat(editRateInc) || 0;
        const rHv = parseFloat(editRateHv) || 0;
        const rSpd = parseFloat(editRateSpd) || 0;
        const suggested = calcAccountPrice(editingAcc, rInc, rHv, rSpd);
        return (
          <div className="modal-backdrop" onClick={() => { if (!priceSaving) setPriceEditing(null); }}>
            <div className="modal-box" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
              <h2>Edit Harga — {editingAcc.sourceAccount}</h2>
              <div className="modal-sub">
                Isi rate buat auto-hitung harga, atau ketik harga manual di kolom bawah. Rate kosong = 0.
              </div>

              <label>Rate Income / 1B</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ color: "var(--dim)", fontSize: 13, fontWeight: 700 }}>Rp</span>
                <input
                  type="number"
                  step="0.5"
                  placeholder="0"
                  value={editRateInc}
                  onChange={(e) => setEditRateInc(e.target.value)}
                  style={{ margin: 0 }}
                />
                <span style={{ color: "var(--dim)", fontSize: 13, fontWeight: 700, minWidth: 50 }}>.000 / 1B</span>
              </div>

              <label>Rate High-Value Pet / 1B</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ color: "var(--dim)", fontSize: 13, fontWeight: 700 }}>Rp</span>
                <input
                  type="number"
                  step="0.5"
                  placeholder="0"
                  value={editRateHv}
                  onChange={(e) => setEditRateHv(e.target.value)}
                  style={{ margin: 0 }}
                />
                <span style={{ color: "var(--dim)", fontSize: 13, fontWeight: 700, minWidth: 50 }}>.000 / 1B</span>
              </div>

              <label>Rate Speed / 1B</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ color: "var(--dim)", fontSize: 13, fontWeight: 700 }}>Rp</span>
                <input
                  type="number"
                  step="0.5"
                  placeholder="0"
                  value={editRateSpd}
                  onChange={(e) => setEditRateSpd(e.target.value)}
                  style={{ margin: 0 }}
                />
                <span style={{ color: "var(--dim)", fontSize: 13, fontWeight: 700, minWidth: 50 }}>.000 / 1B</span>
              </div>

              {suggested > 0 && (
                <div
                  style={{
                    background: "#151b2c",
                    border: "1px solid #2a3556",
                    borderRadius: 8,
                    padding: "10px 14px",
                    marginBottom: 14,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontSize: 12, color: "var(--dim)" }}>Rekomendasi dari rate</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "var(--accent)" }}>{fmtRupiah(suggested)}</div>
                    <button
                      onClick={() => setPriceInput(String(suggested))}
                      style={{ background: "var(--accent)", color: "#000", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
                    >
                      Pakai
                    </button>
                  </div>
                </div>
              )}

              <label>Harga Manual (Rupiah)</label>
              <input
                type="number"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveCatalogPrice(priceEditing); }}
                autoFocus
                placeholder="Ketik harga langsung"
              />

              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setPriceEditing(null)} disabled={priceSaving}>Batal</button>
                <button
                  className="btn-confirm"
                  style={{ background: "var(--accent)", color: "#000" }}
                  onClick={() => saveCatalogPrice(priceEditing)}
                  disabled={priceSaving || !priceInput || Number(priceInput) < 0}
                >
                  {priceSaving ? "Menyimpan..." : "Simpan Harga"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {soldModal && (
        <div className="modal-backdrop" onClick={() => { if (!soldLoading) setSoldModal(null); }}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>Tandai Terjual</h2>
            <div className="modal-sub">
              Akun <strong>{soldModal}</strong> akan dipindahkan ke daftar terjual.
            </div>
            <label>Harga Jual (Rupiah)</label>
            <input
              type="number"
              placeholder="Contoh: 150000"
              value={soldPrice}
              onChange={(e) => setSoldPrice(e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") markSold(); }}
            />
            {soldError && <div className="modal-error">{soldError}</div>}
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setSoldModal(null)} disabled={soldLoading}>
                Batal
              </button>
              <button className="btn-confirm" onClick={markSold} disabled={soldLoading}>
                {soldLoading ? "Memproses..." : "Konfirmasi Terjual"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
