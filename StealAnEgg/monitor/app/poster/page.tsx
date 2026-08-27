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

function fmtDuration(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return "Siap!";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m`;
}

function fmtWeight(w: number | undefined): string {
  if (!w) return "";
  if (w >= 1000) return (w / 1000).toFixed(1) + " kg";
  return w.toFixed(0) + " g";
}

function petKey(p: Pet): string {
  return `${p.category}|${p.name || ""}|${(p.mutations || []).join("+")}|${p.rate}`;
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

function petIconUrl(p: Pet, index: Record<string, string>): string | null {
  const cat = p.category;
  if (p.rarity && cat) {
    return `/icons/normal/${encodeURIComponent(cat)} [${encodeURIComponent(p.rarity)}].png`;
  }
  const filename = index[cat];
  if (filename) {
    return `/icons/normal/${encodeURIComponent(filename)}`;
  }
  return null;
}

function PetIcon({ pet, size = 48 }: { pet: Pet; size?: number }) {
  const [index, setIndex] = useState<Record<string, string>>({});
  useEffect(() => { loadIconIndex().then(setIndex); }, []);

  const src = petIconUrl(pet, index);
  if (!src) {
    return (
      <div
        style={{
          width: size, height: size, background: "#f1f5f9", borderRadius: 10,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: size * 0.4, color: "#94a3b8",
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
      style={{ borderRadius: 10, objectFit: "contain", background: "#f1f5f9" }}
      onError={(e) => {
        const el = e.currentTarget;
        el.style.display = "none";
        const placeholder = document.createElement("div");
        placeholder.style.cssText = `width:${size}px;height:${size}px;background:#f1f5f9;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:${size * 0.4}px;color:#94a3b8`;
        placeholder.textContent = "🐾";
        el.parentElement?.insertBefore(placeholder, el);
      }}
    />
  );
}

function mutColor(mut: string): string {
  const m = mut.toLowerCase();
  if (m.includes("rainbow")) return "#9333ea";
  if (m.includes("golden")) return "#ca8a04";
  if (m.includes("diamond")) return "#2563eb";
  if (m.includes("titanium")) return "#64748b";
  return "#6366f1";
}

function PosterPage() {
  const params = useSearchParams();
  const accountName = params.get("account") || "";
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [price, setPrice] = useState("");
  const [title, setTitle] = useState("Jual Akun GACOR");
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
      const found = (accData.accounts || []).find(
        (a: AccountSummary) => a.sourceAccount === accountName
      );
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
      link.download = `poster-${accountName}.png`;
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

  const allSorted = [...allPets].sort((a, b) => b.rate - a.rate);
  const pool = [...activePets, ...allPets, ...growingEggs, ...backpackEggs].sort(
    (a, b) => b.rate - a.rate
  );

  const seen = new Set<string>();
  const uniquePool: Pet[] = [];
  for (const p of pool) {
    const k = petKey(p);
    if (!seen.has(k)) {
      seen.add(k);
      uniquePool.push(p);
    }
  }

  const activePetsSorted = pool.slice(0, MAX_EQUIP);
  const top3 = uniquePool.slice(0, 3);
  const potentialActiveRate = activePetsSorted.reduce((s, p) => s + (p.rate || 0), 0);
  const highValueTotal = allSorted
    .filter((p) => p.rate >= 1e9)
    .reduce((s, p) => s + p.rate, 0);

  const eggKeys = new Set([...growingEggs, ...backpackEggs].map(petKey));
  const featuredKeys = new Set(top3.map(petKey));

  const mutatedCandidates = uniquePool.filter(
    (p) => p.mutations && p.mutations.length > 0 && p.rate > 500_000_000
  );
  const featured = mutatedCandidates[0] || uniquePool[0] || null;
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
    if (p.rate <= 300_000_000) continue;
    const k = petKey(p);
    if (!featuredKeys.has(k) && !rightSeen.has(k)) {
      rightSeen.add(k);
      rightPanelPets.push(p);
    }
  }
  rightPanelPets.sort((a, b) => b.rate - a.rate);

  const mutGroups = groupByMutation(allSorted);
  const totalEggs = growingEggs.length + backpackEggs.length;

  const statItems = [
    { label: "SPEED", value: fmtCompact(summary.speed) },
    { label: "CASH", value: fmtMoney(summary.money) },
    { label: "INCOME POTENSI PET AKTIF", value: fmtRate(potentialActiveRate) },
    { label: "TOTAL PET >= 1B/S", value: fmtMoney(highValueTotal) },
    { label: "TOTAL EGG", value: `${totalEggs} eggs` },
    ...(summary.treadmillLevel != null
      ? [{ label: "TREADMILL LEVEL", value: `Lv. ${summary.treadmillLevel}` }]
      : []),
  ];

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
        .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }
        .stat-cell {
          background: #ecfdf5; border: 2px solid #16a34a; border-radius: 16px; padding: 10px 14px;
        }
        .stat-cell .slabel { font-size: 11px; font-weight: 700; color: #64748b; letter-spacing: .3px; }
        .stat-cell .sval { font-size: 24px; font-weight: 800; color: #16a34a; margin-top: 2px; }

        .top3 { display: flex; gap: 14px; margin-bottom: 18px; }
        .pick-card {
          flex: 1; background: #fff; border: 1px solid #cbd5e1; border-radius: 16px;
          padding: 14px; text-align: center; min-height: 180px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
        }
        .pick-card .pname { font-size: 16px; font-weight: 800; color: #1e293b; margin-bottom: 4px; word-break: break-word; }
        .pick-card .prate { font-size: 16px; font-weight: 800; color: #16a34a; }
        .pick-card .pmut { font-size: 10px; font-weight: 700; margin-top: 4px; }
        .egg-badge {
          display: inline-block; background: #fff4d6; border: 1px solid #ca8a04;
          border-radius: 10px; padding: 2px 8px; font-size: 10px; font-weight: 700; color: #ca8a04;
          margin-bottom: 4px;
        }

        .featured-box {
          background: #fff; border: 3px solid #ca8a04; border-radius: 16px;
          padding: 16px 20px; margin-bottom: 18px; position: relative;
        }
        .featured-ribbon {
          position: absolute; top: -14px; left: -4px;
          background: #ca8a04; color: #fff; font-size: 12px; font-weight: 800;
          padding: 6px 16px; border-radius: 10px;
        }
        .featured-name { font-size: 22px; font-weight: 800; color: #1e293b; margin-top: 16px; }
        .featured-rate { font-size: 28px; font-weight: 800; color: #16a34a; margin-top: 4px; }
        .featured-mut { font-size: 14px; font-weight: 700; margin-top: 2px; }

        .section-header {
          background: #e2e8f0; border-radius: 20px; padding: 8px 0;
          text-align: center; font-size: 16px; font-weight: 800; color: #1e293b;
          margin-bottom: 12px;
        }
        .mut-group-label { font-size: 13px; font-weight: 700; margin-bottom: 6px; }
        .mut-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
        .mut-cell {
          background: #fff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px;
        }
        .mut-cell .mrate { font-size: 14px; font-weight: 800; color: #16a34a; }
        .mut-cell .mname { font-size: 11px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

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
        .pet-icon-placeholder {
          width: 48px; height: 48px; background: #f1f5f9; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 20px; color: #94a3b8;
        }
        .pet-info .piname { font-size: 15px; font-weight: 800; color: #1e293b; }
        .pet-info .pirate { font-size: 14px; font-weight: 700; color: #16a34a; }
        .pet-info .piweight { font-size: 11px; color: #64748b; }
        .mut-tag {
          border-radius: 10px; padding: 4px 10px; font-size: 10px; font-weight: 700;
          border: 1px solid; margin-left: auto; white-space: nowrap;
        }

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
        }
        .egg-cell .ename { font-size: 11px; font-weight: 700; color: #1e293b; }
        .egg-cell .erate { font-size: 13px; font-weight: 800; color: #16a34a; }
        .egg-cell .etime { font-size: 12px; font-weight: 700; color: #2563eb; }
        .egg-cell .eweight { font-size: 10px; color: #64748b; }

        .account-tag {
          position: absolute; bottom: 12px; right: 16px;
          font-size: 16px; font-weight: 800; color: #64748b;
        }
      `}</style>

      <div className="controls">
        <a href="/">← Dashboard</a>
        <a href="/catalog">Katalog</a>
        <span style={{ width: 1, height: 20, background: "#262636" }} />
        <label>Judul:</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
        <label>Harga:</label>
        <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="contoh: Rp 150.000" />
        <button className="dlbtn" onClick={downloadPoster} disabled={downloading}>
          {downloading ? "Downloading..." : "Download PNG"}
        </button>
      </div>

      <div className="poster-wrap">
        <div className="poster" ref={posterRef} style={{ position: "relative" }}>
          {/* LEFT COLUMN */}
          <div className="left">
            <div className="poster-title">{title}</div>

            <div className="stat-grid">
              {statItems.map((s, i) => (
                <div key={i} className="stat-cell">
                  <div className="slabel">{s.label}</div>
                  <div className="sval">{s.value}</div>
                </div>
              ))}
            </div>

            {top3.length > 0 && (
              <div className="top3">
                {top3.map((p, i) => (
                  <div key={i} className="pick-card">
                    {eggKeys.has(petKey(p)) && <span className="egg-badge">TELUR</span>}
                    <PetIcon pet={p} size={64} />
                    <div className="pname">{p.name || p.category}</div>
                    <div className="prate">{fmtRate(p.rate)}</div>
                    {p.mutations && p.mutations.length > 0 && (
                      <div className="pmut" style={{ color: mutColor(p.mutations[0]) }}>
                        MUTASI: {p.mutations.map((m) => m.toUpperCase()).join(" + ")}
                      </div>
                    )}
                    {p.weight ? <div style={{ fontSize: 11, color: "#64748b" }}>{fmtWeight(p.weight)}</div> : null}
                  </div>
                ))}
              </div>
            )}

            {featured && (
              <div className="featured-box" style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div className="featured-ribbon">PALING GACOR!</div>
                {eggKeys.has(petKey(featured)) && (
                  <span className="egg-badge" style={{ position: "absolute", top: -14, left: 180 }}>TELUR</span>
                )}
                <PetIcon pet={featured} size={80} />
                <div>
                  {featured.mutations && featured.mutations.length > 0 && (
                    <div className="featured-mut" style={{ color: mutColor(featured.mutations[0]) }}>
                      {featured.mutations.map((m) => m.toUpperCase()).join(" + ")}
                    </div>
                  )}
                  <div className="featured-name">{(featured.name || featured.category).toUpperCase()}</div>
                  <div className="featured-rate">{fmtRate(featured.rate)}</div>
                  {featured.weight ? <div style={{ fontSize: 14, color: "#64748b" }}>{fmtWeight(featured.weight)}</div> : null}
                </div>
              </div>
            )}

            {mutGroups.length > 0 && (
              <>
                <div className="section-header">DIKELOMPOKKAN PER MUTASI</div>
                {mutGroups.slice(0, 6).map(([groupName, items]) => {
                  const sorted = [...items].sort((a, b) => b.rate - a.rate).slice(0, 6);
                  return (
                    <div key={groupName}>
                      <div className="mut-group-label" style={{ color: mutColor(groupName.split(" + ")[0]) }}>
                        {groupName} ({items.length})
                      </div>
                      <div className="mut-grid">
                        {sorted.map((p, i) => (
                          <div key={i} className="mut-cell" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <PetIcon pet={p} size={32} />
                            <div>
                              <div className="mrate">{fmtRate(p.rate)}</div>
                              <div className="mname">{p.name || p.category}</div>
                              {p.weight ? <div style={{ fontSize: 10, color: "#64748b" }}>{fmtWeight(p.weight)}</div> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {growingEggs.length > 0 && (
              <div className="egg-section">
                <div className="section-header">TELUR YANG SEDANG TUMBUH</div>
                <div className="egg-grid">
                  {growingEggs.slice(0, 9).map((e, i) => (
                    <div key={i} className="egg-cell">
                      <div className="ename">
                        {e.mutations && e.mutations.length > 0
                          ? e.mutations.map((m) => m.toUpperCase()).join(" + ") + " " + e.category
                          : e.category}
                      </div>
                      {e.ready ? (
                        <div className="erate">SIAP MENETAS!</div>
                      ) : (
                        <div className="etime">{fmtDuration(e.remainingSeconds)}</div>
                      )}
                      {e.rate ? <div className="erate">{fmtRate(e.rate)}</div> : null}
                      {e.weight ? <div className="eweight">{fmtWeight(e.weight)}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {backpackEggs.length > 0 && (
              <div className="egg-section">
                <div className="section-header">TELUR DI TAS (BELUM DITARUH)</div>
                <div className="egg-grid">
                  {backpackEggs.slice(0, 9).map((e, i) => (
                    <div key={i} className="egg-cell">
                      <div className="ename">
                        {e.mutations && e.mutations.length > 0
                          ? e.mutations.map((m) => m.toUpperCase()).join(" + ") + " " + e.category
                          : e.category}
                      </div>
                      {e.rate ? <div className="erate">{fmtRate(e.rate)}</div> : null}
                      {e.weight ? <div className="eweight">{fmtWeight(e.weight)}</div> : null}
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
              <div className="count">{Math.min(rightPanelPets.length, 8)}/{activeLimit} ACTIVE</div>
              <div className="equip-badge">EQUIP BEST</div>
            </div>

            {rightPanelPets.length > 0 ? (
              <div className="pet-list">
                {rightPanelPets.slice(0, 8).map((p, i) => (
                  <div key={i} className="pet-row">
                    <PetIcon pet={p} size={48} />
                    <div className="pet-info">
                      <div className="piname">{p.name || p.category}</div>
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

            <div className="price-box">
              <div className="price-label">PRICE ACC</div>
              {price ? (
                <div className="price-value">{price}</div>
              ) : (
                <div className="price-empty">Isi harga di controls atas</div>
              )}
            </div>
          </div>

          <div className="account-tag">{accountName}</div>
        </div>
      </div>
    </>
  );
}

function groupByMutation(pets: Pet[]): [string, Pet[]][] {
  const groups: Record<string, Pet[]> = {};
  for (const p of pets) {
    if (!p.mutations || p.mutations.length === 0) continue;
    const key = p.mutations.map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join(" + ");
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }
  return Object.entries(groups).sort((a, b) => {
    const maxA = Math.max(...a[1].map((p) => p.rate || 0));
    const maxB = Math.max(...b[1].map((p) => p.rate || 0));
    return maxB - maxA;
  });
}
