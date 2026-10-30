import Link from "next/link";
import Image from "next/image";

const FEATURES = [
  { icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", title: "Transaksi Aman", desc: "Pembayaran via WhatsApp langsung ke seller, tanpa perantara" },
  { icon: "M13 10V3L4 14h7v7l9-11h-7z", title: "Fast Response", desc: "Admin aktif setiap hari, proses cepat setelah pembayaran" },
  { icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", title: "Harga Bersaing", desc: "Harga terjangkau untuk semua produk game Roblox" },
];

const CATEGORIES = [
  { label: "Akun Game", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
  { label: "Item Game", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
  { label: "Joki / Top Up", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
];

function SvgIcon({ d, size = 24 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  );
}

export default function LandingPage() {
  return (
    <div style={{ background: "#09090b", color: "#fafafa", minHeight: "100vh" }}>
      <style>{`
        .landing-nav { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; max-width: 1200px; margin: 0 auto; }
        .landing-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; color: #fafafa; }
        .landing-logo-icon { width: 36px; height: 36px; border-radius: 10px; overflow: hidden; }
        .landing-logo-text { font-family: var(--font-bebas), system-ui; font-size: 24px; letter-spacing: 1px; }
        .landing-nav-links { display: flex; align-items: center; gap: 8px; }
        .landing-nav-btn { padding: 8px 20px; border-radius: 8px; font-size: 13px; font-weight: 700; text-decoration: none; transition: all .15s; border: none; cursor: pointer; }
        .landing-nav-btn.ghost { background: transparent; color: #a1a1aa; }
        .landing-nav-btn.ghost:hover { color: #fafafa; }
        .landing-nav-btn.primary { background: #ef4444; color: #fff; }
        .landing-nav-btn.primary:hover { background: #dc2626; }

        .landing-hero { display: flex; align-items: center; justify-content: center; gap: 60px; padding: 60px 24px 80px; max-width: 1200px; margin: 0 auto; }
        .landing-hero-text { max-width: 520px; }
        .landing-hero-text h1 { font-family: var(--font-bebas), system-ui; font-size: clamp(40px, 6vw, 64px); line-height: 1; margin: 0 0 16px; letter-spacing: 1px; }
        .landing-hero-text h1 span { color: #ef4444; }
        .landing-hero-text p { color: #a1a1aa; font-size: 16px; line-height: 1.7; margin: 0 0 32px; }
        .landing-hero-cta { display: flex; gap: 12px; flex-wrap: wrap; }
        .landing-hero-cta a { padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 15px; text-decoration: none; transition: all .15s; }
        .landing-hero-cta .cta-primary { background: #ef4444; color: #fff; }
        .landing-hero-cta .cta-primary:hover { background: #dc2626; }
        .landing-hero-cta .cta-secondary { background: #18181b; color: #fafafa; border: 1px solid #27272a; }
        .landing-hero-cta .cta-secondary:hover { border-color: #3f3f46; }
        .landing-hero-img { flex-shrink: 0; }

        .landing-categories { padding: 0 24px 80px; max-width: 1200px; margin: 0 auto; }
        .landing-categories h2 { font-size: 13px; font-weight: 700; color: #52525b; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 20px; text-align: center; }
        .landing-cat-grid { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
        .landing-cat-card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 24px 32px; display: flex; align-items: center; gap: 14px; min-width: 200px; transition: all .15s; cursor: default; }
        .landing-cat-card:hover { border-color: #ef4444; background: #1a1a1d; }
        .landing-cat-icon { width: 44px; height: 44px; border-radius: 10px; background: #ef444420; color: #ef4444; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .landing-cat-label { font-size: 15px; font-weight: 700; }

        .landing-features { padding: 0 24px 80px; max-width: 1200px; margin: 0 auto; }
        .landing-features h2 { font-family: var(--font-bebas), system-ui; font-size: 32px; text-align: center; margin: 0 0 40px; letter-spacing: 1px; }
        .landing-feat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
        .landing-feat-card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 28px; }
        .landing-feat-icon { width: 48px; height: 48px; border-radius: 12px; background: #ef444420; color: #ef4444; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; }
        .landing-feat-card h3 { font-size: 16px; font-weight: 800; margin: 0 0 8px; }
        .landing-feat-card p { color: #71717a; font-size: 13px; line-height: 1.6; margin: 0; }

        .landing-cta-section { text-align: center; padding: 60px 24px 80px; background: linear-gradient(180deg, transparent 0%, #ef444410 100%); }
        .landing-cta-section h2 { font-family: var(--font-bebas), system-ui; font-size: 36px; margin: 0 0 12px; }
        .landing-cta-section p { color: #a1a1aa; font-size: 15px; margin: 0 0 28px; }

        .landing-footer { border-top: 1px solid #1c1c1e; padding: 24px; text-align: center; color: #52525b; font-size: 12px; }

        .landing-wa-float { position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px; border-radius: 50%; background: #25D366; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 20px rgba(37,211,102,.4); z-index: 50; transition: transform .15s; text-decoration: none; }
        .landing-wa-float:hover { transform: scale(1.1); }

        @media (max-width: 768px) {
          .landing-hero { flex-direction: column-reverse; text-align: center; padding: 40px 20px 60px; gap: 32px; }
          .landing-hero-cta { justify-content: center; }
          .landing-hero-img { width: 200px !important; height: 200px !important; }
        }
      `}</style>

      {/* Navbar */}
      <nav className="landing-nav">
        <Link href="/" className="landing-logo">
          <div className="landing-logo-icon">
            <Image src="/mascot/naru-icon.png" alt="Narua" width={36} height={36} />
          </div>
          <span className="landing-logo-text">NARUA</span>
        </Link>
        <div className="landing-nav-links">
          <Link href="/login" className="landing-nav-btn ghost">Masuk</Link>
          <Link href="/register" className="landing-nav-btn primary">Daftar</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-hero-text">
          <h1>TOKO GAME<br /><span>ROBLOX</span> TERPERCAYA</h1>
          <p>Jual-beli akun & item game Roblox dengan harga terjangkau. Transaksi aman langsung via WhatsApp.</p>
          <div className="landing-hero-cta">
            <Link href="/store" className="cta-primary">Lihat Katalog</Link>
            <a href="https://wa.me/6285172332233" target="_blank" rel="noopener" className="cta-secondary">Chat WhatsApp</a>
          </div>
        </div>
        <div className="landing-hero-img" style={{ width: 280, height: 280, position: "relative" }}>
          <Image src="/mascot/night-mode-mascot.png" alt="Naru Mascot" fill style={{ objectFit: "contain" }} priority />
        </div>
      </section>

      {/* Categories */}
      <section className="landing-categories">
        <h2>Kategori Produk</h2>
        <div className="landing-cat-grid">
          {CATEGORIES.map((cat) => (
            <div key={cat.label} className="landing-cat-card">
              <div className="landing-cat-icon"><SvgIcon d={cat.icon} /></div>
              <span className="landing-cat-label">{cat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="landing-features">
        <h2>KENAPA BELANJA DI NARUA?</h2>
        <div className="landing-feat-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="landing-feat-card">
              <div className="landing-feat-icon"><SvgIcon d={f.icon} /></div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Bottom */}
      <section className="landing-cta-section">
        <h2>SIAP BELANJA?</h2>
        <p>Daftar sekarang dan mulai jelajahi katalog kami</p>
        <Link href="/register" className="landing-nav-btn primary" style={{ padding: "14px 40px", fontSize: 15, textDecoration: "none", display: "inline-block", borderRadius: 10 }}>Daftar Gratis</Link>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        &copy; {new Date().getFullYear()} Narua. All rights reserved.
      </footer>

      {/* Floating WhatsApp */}
      <a href="https://wa.me/6285172332233" target="_blank" rel="noopener" className="landing-wa-float" aria-label="Chat WhatsApp">
        <svg width={28} height={28} viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
      </a>
    </div>
  );
}
