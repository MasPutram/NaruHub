"use client";

import { useEffect, useState, useCallback } from "react";
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
  created_at: string;
}

const CATEGORIES = [
  { value: "", label: "Semua" },
  { value: "akun", label: "Akun" },
  { value: "item", label: "Item" },
  { value: "joki", label: "Joki" },
];

const SORTS = [
  { value: "newest", label: "Terbaru" },
  { value: "price_asc", label: "Termurah" },
  { value: "price_desc", label: "Termahal" },
];

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function StorePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("newest");
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (search) params.set("search", search);
    if (sort) params.set("sort", sort);
    const res = await fetch(`/api/store/products?${params}`);
    if (res.ok) {
      const data = await res.json();
      setProducts(data.products);
      setTotal(data.total);
    }
    setLoading(false);
  }, [category, sort, search]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
      <style>{`
        .store-header { margin-bottom: 24px; }
        .store-header h1 { font-size: 24px; font-weight: 800; margin: 0 0 4px; }
        .store-header p { color: #71717a; font-size: 14px; margin: 0; }
        .store-filters { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; align-items: center; }
        .store-search { flex: 1; min-width: 200px; padding: 9px 14px; background: #18181b; border: 1px solid #27272a; border-radius: 8px; color: #fafafa; font-size: 13px; outline: none; }
        .store-search:focus { border-color: #ef4444; }
        .store-select { padding: 9px 12px; background: #18181b; border: 1px solid #27272a; border-radius: 8px; color: #fafafa; font-size: 13px; outline: none; cursor: pointer; }
        .store-cat-pills { display: flex; gap: 6px; flex-wrap: wrap; }
        .store-pill { padding: 7px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; border: 1px solid #27272a; background: transparent; color: #a1a1aa; cursor: pointer; transition: all .15s; }
        .store-pill:hover { border-color: #ef4444; color: #fafafa; }
        .store-pill.active { background: #ef4444; border-color: #ef4444; color: #fff; }
        .store-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
        .store-card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; transition: all .15s; text-decoration: none; color: #fafafa; display: block; }
        .store-card:hover { border-color: #3f3f46; transform: translateY(-2px); }
        .store-card-img { width: 100%; aspect-ratio: 16/10; background: #27272a; display: flex; align-items: center; justify-content: center; color: #52525b; font-size: 13px; overflow: hidden; }
        .store-card-img img { width: 100%; height: 100%; object-fit: cover; }
        .store-card-body { padding: 16px; }
        .store-card-cat { font-size: 11px; font-weight: 700; color: #ef4444; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
        .store-card-name { font-size: 15px; font-weight: 700; margin: 0 0 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .store-card-price { font-size: 18px; font-weight: 800; color: #ef4444; font-family: var(--font-numbers), monospace; }
        .store-card-game { font-size: 11px; color: #71717a; margin-top: 8px; }
        .store-empty { text-align: center; padding: 60px 20px; color: #52525b; }
        .store-empty h3 { font-size: 18px; color: #71717a; margin: 0 0 8px; }
        .store-loading { text-align: center; padding: 60px 20px; color: #71717a; }
        @media (max-width: 640px) {
          .store-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
          .store-card-body { padding: 12px; }
          .store-card-name { font-size: 13px; }
          .store-card-price { font-size: 15px; }
        }
      `}</style>

      <div className="store-header">
        <h1>Katalog Produk</h1>
        <p>{total} produk tersedia</p>
      </div>

      <div className="store-filters">
        <input
          className="store-search"
          placeholder="Cari produk..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchProducts()}
        />
        <select className="store-select" value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="store-cat-pills" style={{ marginBottom: 24 }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            className={`store-pill ${category === c.value ? "active" : ""}`}
            onClick={() => setCategory(c.value)}
          >{c.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="store-loading">Memuat produk...</div>
      ) : products.length === 0 ? (
        <div className="store-empty">
          <h3>Belum ada produk</h3>
          <p>Produk akan segera tersedia. Stay tuned!</p>
        </div>
      ) : (
        <div className="store-grid">
          {products.map((p) => (
            <Link key={p.id} href={`/store/${p.id}`} className="store-card">
              <div className="store-card-img">
                {p.images && p.images.length > 0 ? (
                  <img src={p.images[0]} alt={p.name} />
                ) : (
                  "No Image"
                )}
              </div>
              <div className="store-card-body">
                <div className="store-card-cat">{p.category}</div>
                <h3 className="store-card-name">{p.name}</h3>
                <div className="store-card-price">{formatRupiah(p.price)}</div>
                <div className="store-card-game">{p.game}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
