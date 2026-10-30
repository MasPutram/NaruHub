"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  game: string;
  price: number;
  images: string[];
  status: string;
  stock_count: number;
  sold_count: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function ProductDetailPage() {
  const { id } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedImg, setSelectedImg] = useState(0);
  const [ordering, setOrdering] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/store/products/${id}`);
      if (res.ok) {
        setProduct(await res.json());
      } else {
        setError("Produk tidak ditemukan");
      }
      setLoading(false);
    })();
  }, [id]);

  async function handleOrder() {
    setOrdering(true);
    try {
      const res = await fetch("/api/store/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: id }),
      });
      const data = await res.json();
      if (res.ok && data.wa_link) {
        window.open(data.wa_link, "_blank");
      } else {
        alert(data.error || "Gagal membuat order");
      }
    } catch {
      alert("Gagal menghubungi server");
    } finally {
      setOrdering(false);
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#71717a" }}>Memuat...</div>;
  if (error || !product) return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <p style={{ color: "#ef4444", marginBottom: 16 }}>{error || "Produk tidak ditemukan"}</p>
      <Link href="/store" style={{ color: "#ef4444", textDecoration: "none", fontWeight: 600 }}>← Kembali ke katalog</Link>
    </div>
  );

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px" }}>
      <style>{`
        .pd-back { color: #a1a1aa; font-size: 13px; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; margin-bottom: 20px; }
        .pd-back:hover { color: #fafafa; }
        .pd-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
        .pd-gallery { display: flex; flex-direction: column; gap: 10px; }
        .pd-main-img { width: 100%; aspect-ratio: 4/3; background: #18181b; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; display: flex; align-items: center; justify-content: center; color: #52525b; }
        .pd-main-img img { width: 100%; height: 100%; object-fit: cover; }
        .pd-thumbs { display: flex; gap: 8px; overflow-x: auto; }
        .pd-thumb { width: 64px; height: 48px; border-radius: 8px; border: 2px solid transparent; overflow: hidden; cursor: pointer; background: #18181b; flex-shrink: 0; }
        .pd-thumb.active { border-color: #ef4444; }
        .pd-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .pd-info { display: flex; flex-direction: column; }
        .pd-cat { font-size: 12px; font-weight: 700; color: #ef4444; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 8px; }
        .pd-name { font-size: 24px; font-weight: 800; margin: 0 0 8px; line-height: 1.3; }
        .pd-game { font-size: 13px; color: #71717a; margin-bottom: 20px; }
        .pd-price { font-size: 32px; font-weight: 900; color: #ef4444; font-family: var(--font-numbers), monospace; margin-bottom: 24px; }
        .pd-desc { color: #a1a1aa; font-size: 14px; line-height: 1.7; margin-bottom: 24px; white-space: pre-wrap; }
        .pd-meta { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
        .pd-meta-item { background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 10px 16px; }
        .pd-meta-label { font-size: 11px; color: #71717a; font-weight: 600; }
        .pd-meta-val { font-size: 14px; font-weight: 700; margin-top: 2px; }
        .pd-order-btn { width: 100%; padding: 16px; background: #25D366; color: #fff; border: none; border-radius: 10px; font-size: 16px; font-weight: 800; cursor: pointer; transition: all .15s; display: flex; align-items: center; justify-content: center; gap: 10px; }
        .pd-order-btn:hover { background: #22c55e; }
        .pd-order-btn:disabled { opacity: .5; cursor: not-allowed; }
        @media (max-width: 768px) {
          .pd-layout { grid-template-columns: 1fr; gap: 20px; }
          .pd-price { font-size: 26px; }
        }
      `}</style>

      <Link href="/store" className="pd-back">← Kembali ke katalog</Link>

      <div className="pd-layout">
        <div className="pd-gallery">
          <div className="pd-main-img">
            {product.images && product.images.length > 0 ? (
              <img src={product.images[selectedImg] || product.images[0]} alt={product.name} />
            ) : (
              "No Image"
            )}
          </div>
          {product.images && product.images.length > 1 && (
            <div className="pd-thumbs">
              {product.images.map((img, i) => (
                <div key={i} className={`pd-thumb ${i === selectedImg ? "active" : ""}`} onClick={() => setSelectedImg(i)}>
                  <img src={img} alt={`${product.name} ${i + 1}`} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pd-info">
          <div className="pd-cat">{product.category} — {product.game}</div>
          <h1 className="pd-name">{product.name}</h1>
          <div className="pd-game">Ditambahkan {new Date(product.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</div>
          <div className="pd-price">{formatRupiah(product.price)}</div>

          <div className="pd-meta">
            <div className="pd-meta-item">
              <div className="pd-meta-label">Stok</div>
              <div className="pd-meta-val">{product.stock_count > 0 ? product.stock_count : "Habis"}</div>
            </div>
            <div className="pd-meta-item">
              <div className="pd-meta-label">Terjual</div>
              <div className="pd-meta-val">{product.sold_count}</div>
            </div>
          </div>

          {product.description && <div className="pd-desc">{product.description}</div>}

          <button onClick={handleOrder} disabled={ordering || product.stock_count <= 0} className="pd-order-btn">
            <svg width={20} height={20} viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
            {ordering ? "Memproses..." : product.stock_count <= 0 ? "Stok Habis" : "Pesan via WhatsApp"}
          </button>
        </div>
      </div>
    </div>
  );
}
