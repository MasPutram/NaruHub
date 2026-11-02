"use client";

import { useEffect, useState, useCallback } from "react";

interface Offer {
  id: string;
  offerTitle?: string;
  description?: string;
  quantity?: number;
  minQuantity?: number;
  price?: number;
  currency?: string;
  state?: string;
  guaranteedDeliveryTime?: string;
  createdAt?: string;
  mainOfferImage?: { smallImage?: string; largeImage?: string };
}

interface NewItem {
  title: string;
  description: string;
  price: number;
  quantity: number;
  minQuantity: number;
  deliveryTime: string;
}

const DELIVERY_OPTIONS = [
  { value: "Instant", label: "Instant" },
  { value: "Minute5", label: "5 min" },
  { value: "Minute20", label: "20 min" },
  { value: "Hour1", label: "1 jam" },
  { value: "Hour2", label: "2 jam" },
  { value: "Hour5", label: "5 jam" },
  { value: "Hour12", label: "12 jam" },
  { value: "Day1", label: "1 hari" },
  { value: "Day3", label: "3 hari" },
  { value: "Day7", label: "7 hari" },
];

const emptyItem = (): NewItem => ({
  title: "",
  description: "",
  price: 0,
  quantity: 1,
  minQuantity: 1,
  deliveryTime: "Minute20",
});

export default function EldoradoPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"list" | "create">("list");

  // Bulk create state
  const [newItems, setNewItems] = useState<NewItem[]>([emptyItem()]);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<any[] | null>(null);

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/eldorado/offers");
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const items = data.items || data.results || data || [];
      setOffers(Array.isArray(items) ? items : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOffers(); }, [fetchOffers]);

  async function handleAction(offerId: string, action: string) {
    try {
      const res = await fetch(`/api/eldorado/offers/${offerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) fetchOffers();
      else alert("Action failed");
    } catch { alert("Action failed"); }
  }

  async function handleDelete(offerId: string) {
    if (!confirm("Hapus listing ini?")) return;
    try {
      const res = await fetch(`/api/eldorado/offers/${offerId}`, { method: "DELETE" });
      if (res.ok) fetchOffers();
      else alert("Delete failed");
    } catch { alert("Delete failed"); }
  }

  function updateItem(idx: number, field: keyof NewItem, value: any) {
    setNewItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  function addRow() {
    setNewItems((prev) => [...prev, emptyItem()]);
  }

  function removeRow(idx: number) {
    setNewItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function duplicateRow(idx: number) {
    setNewItems((prev) => {
      const copy = { ...prev[idx] };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  }

  async function handleBulkUpload() {
    const valid = newItems.filter((i) => i.title.trim() && i.price > 0);
    if (valid.length === 0) { alert("Isi minimal 1 item dengan title dan price"); return; }

    setUploading(true);
    setUploadResults(null);
    try {
      const res = await fetch("/api/eldorado/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valid),
      });
      const data = await res.json();
      setUploadResults(data.results || []);
      if (data.results?.every((r: any) => r.ok)) {
        setNewItems([emptyItem()]);
        fetchOffers();
      }
    } catch (e: any) {
      alert("Upload error: " + e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <style>{`
        .edo-page { padding: 24px 32px; max-width: 1400px; }
        .edo-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
        .edo-title { font-size: 22px; font-weight: 800; color: #fafafa; }
        .edo-badge { background: #f59e0b; color: #000; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 6px; }
        .edo-tabs { display: flex; gap: 4px; margin-bottom: 20px; }
        .edo-tab {
          padding: 8px 20px; border-radius: 8px; font-size: 13px; font-weight: 700;
          cursor: pointer; border: none; transition: all .15s;
          background: #18181b; color: #71717a;
        }
        .edo-tab:hover { color: #fafafa; }
        .edo-tab.active { background: #f59e0b; color: #000; }

        .edo-table { width: 100%; border-collapse: separate; border-spacing: 0; }
        .edo-table th {
          text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 700;
          color: #71717a; text-transform: uppercase; letter-spacing: .5px;
          border-bottom: 1px solid #27272a;
        }
        .edo-table td { padding: 10px 12px; font-size: 13px; color: #d4d4d8; border-bottom: 1px solid #1c1c1e; }
        .edo-table tr:hover td { background: #18181b; }
        .edo-img { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; background: #27272a; }

        .edo-state { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; }
        .edo-state.active { background: #065f4620; color: #34d399; }
        .edo-state.paused { background: #78350f20; color: #fbbf24; }

        .edo-btn {
          padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 700;
          cursor: pointer; border: none; transition: all .15s;
        }
        .edo-btn.sm { padding: 4px 8px; font-size: 10px; }
        .edo-btn.primary { background: #f59e0b; color: #000; }
        .edo-btn.primary:hover { background: #d97706; }
        .edo-btn.danger { background: #dc262620; color: #ef4444; }
        .edo-btn.danger:hover { background: #dc262640; }
        .edo-btn.ghost { background: #27272a; color: #a1a1aa; }
        .edo-btn.ghost:hover { background: #3f3f46; color: #fafafa; }
        .edo-btn:disabled { opacity: .5; cursor: not-allowed; }

        .edo-actions { display: flex; gap: 4px; }

        .edo-form-table { width: 100%; border-collapse: separate; border-spacing: 0; }
        .edo-form-table th {
          text-align: left; padding: 8px 8px; font-size: 11px; font-weight: 700;
          color: #71717a; text-transform: uppercase; letter-spacing: .5px;
          border-bottom: 1px solid #27272a; position: sticky; top: 0; background: #09090b; z-index: 1;
        }
        .edo-form-table td { padding: 4px 4px; vertical-align: top; }
        .edo-input {
          width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid #27272a;
          background: #18181b; color: #fafafa; font-size: 12px; font-family: inherit;
          outline: none; transition: border .15s;
        }
        .edo-input:focus { border-color: #f59e0b; }
        .edo-input.sm { width: 80px; }
        .edo-select {
          padding: 8px 10px; border-radius: 6px; border: 1px solid #27272a;
          background: #18181b; color: #fafafa; font-size: 12px; font-family: inherit;
          outline: none; cursor: pointer;
        }
        .edo-select:focus { border-color: #f59e0b; }

        .edo-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .edo-count { font-size: 12px; color: #71717a; margin-left: auto; }

        .edo-result { margin-top: 12px; padding: 12px; border-radius: 8px; font-size: 12px; }
        .edo-result.success { background: #065f4620; color: #34d399; }
        .edo-result.error { background: #dc262620; color: #ef4444; }
        .edo-result.mixed { background: #78350f20; color: #fbbf24; }

        .edo-empty { text-align: center; padding: 60px 20px; color: #52525b; }
        .edo-empty-icon { font-size: 48px; margin-bottom: 12px; }
        .edo-empty-text { font-size: 14px; font-weight: 600; }
        .edo-empty-sub { font-size: 12px; color: #3f3f46; margin-top: 4px; }

        .edo-row-num { font-size: 11px; color: #52525b; font-weight: 700; text-align: center; width: 32px; }
      `}</style>

      <div className="edo-page">
        <div className="edo-header">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
          </svg>
          <span className="edo-title">Eldorado</span>
          <span className="edo-badge">ANIME DICE</span>
        </div>

        <div className="edo-tabs">
          <button className={`edo-tab ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}>
            Listings ({offers.length})
          </button>
          <button className={`edo-tab ${tab === "create" ? "active" : ""}`} onClick={() => setTab("create")}>
            Upload Baru
          </button>
        </div>

        {tab === "list" && (
          <>
            <div className="edo-toolbar">
              <button className="edo-btn ghost" onClick={fetchOffers} disabled={loading}>
                {loading ? "Loading..." : "↻ Refresh"}
              </button>
            </div>

            {error && <div className="edo-result error">{error}</div>}

            {!loading && !error && offers.length === 0 && (
              <div className="edo-empty">
                <div className="edo-empty-icon">📦</div>
                <div className="edo-empty-text">Belum ada listing</div>
                <div className="edo-empty-sub">Buka tab "Upload Baru" untuk mulai jual item</div>
              </div>
            )}

            {offers.length > 0 && (
              <table className="edo-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Title</th>
                    <th>Qty</th>
                    <th>Min</th>
                    <th>Price</th>
                    <th>Delivery</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map((o) => (
                    <tr key={o.id}>
                      <td>
                        {o.mainOfferImage?.smallImage ? (
                          <img className="edo-img" src={o.mainOfferImage.smallImage} alt="" />
                        ) : (
                          <div className="edo-img" />
                        )}
                      </td>
                      <td style={{ fontWeight: 600, color: "#fafafa", maxWidth: 300 }}>{o.offerTitle || "-"}</td>
                      <td>{o.quantity ?? "-"}</td>
                      <td>{o.minQuantity ?? "-"}</td>
                      <td style={{ fontWeight: 700, color: "#f59e0b" }}>
                        ${o.price ?? "?"}{o.currency && o.currency !== "USD" ? ` ${o.currency}` : ""}
                      </td>
                      <td style={{ fontSize: 11, color: "#71717a" }}>{o.guaranteedDeliveryTime || "-"}</td>
                      <td>
                        <span className={`edo-state ${(o.state || "").toLowerCase() === "active" ? "active" : "paused"}`}>
                          {o.state || "?"}
                        </span>
                      </td>
                      <td>
                        <div className="edo-actions">
                          {(o.state || "").toLowerCase() === "active" ? (
                            <button className="edo-btn sm ghost" onClick={() => handleAction(o.id, "pause")}>⏸</button>
                          ) : (
                            <button className="edo-btn sm ghost" onClick={() => handleAction(o.id, "resume")}>▶</button>
                          )}
                          <button className="edo-btn sm danger" onClick={() => handleDelete(o.id)}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {tab === "create" && (
          <>
            <div className="edo-toolbar">
              <button className="edo-btn ghost" onClick={addRow}>+ Tambah Row</button>
              <button
                className="edo-btn primary"
                onClick={handleBulkUpload}
                disabled={uploading || newItems.every((i) => !i.title.trim())}
              >
                {uploading ? "Uploading..." : `Upload ${newItems.filter((i) => i.title.trim() && i.price > 0).length} Item`}
              </button>
              <span className="edo-count">{newItems.length} row</span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="edo-form-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th style={{ minWidth: 250 }}>Title</th>
                    <th style={{ minWidth: 200 }}>Description</th>
                    <th style={{ width: 80 }}>Price ($)</th>
                    <th style={{ width: 60 }}>Qty</th>
                    <th style={{ width: 60 }}>Min Qty</th>
                    <th style={{ width: 100 }}>Delivery</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {newItems.map((item, idx) => (
                    <tr key={idx}>
                      <td className="edo-row-num">{idx + 1}</td>
                      <td>
                        <input
                          className="edo-input"
                          placeholder="Nama item..."
                          value={item.title}
                          onChange={(e) => updateItem(idx, "title", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="edo-input"
                          placeholder="Deskripsi (opsional)"
                          value={item.description}
                          onChange={(e) => updateItem(idx, "description", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="edo-input sm"
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.price || ""}
                          onChange={(e) => updateItem(idx, "price", parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <input
                          className="edo-input sm"
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                        />
                      </td>
                      <td>
                        <input
                          className="edo-input sm"
                          type="number"
                          min="1"
                          value={item.minQuantity}
                          onChange={(e) => updateItem(idx, "minQuantity", parseInt(e.target.value) || 1)}
                        />
                      </td>
                      <td>
                        <select
                          className="edo-select"
                          value={item.deliveryTime}
                          onChange={(e) => updateItem(idx, "deliveryTime", e.target.value)}
                        >
                          {DELIVERY_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="edo-actions">
                          <button className="edo-btn sm ghost" onClick={() => duplicateRow(idx)} title="Duplicate">⧉</button>
                          {newItems.length > 1 && (
                            <button className="edo-btn sm danger" onClick={() => removeRow(idx)} title="Hapus">✕</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {uploadResults && (
              <div className={`edo-result ${uploadResults.every((r) => r.ok) ? "success" : uploadResults.some((r) => r.ok) ? "mixed" : "error"}`}>
                <strong>Hasil Upload:</strong>
                <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                  {uploadResults.map((r, i) => (
                    <li key={i}>
                      {r.ok ? "✓" : "✗"} {r.title} — {r.ok ? "Berhasil" : `Gagal (${r.status})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
