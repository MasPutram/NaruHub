import Link from "next/link";

const TRUST = [
  { icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", label: "Transaksi Aman" },
  { icon: "M13 10V3L4 14h7v7l9-11h-7z", label: "Fast Response" },
  { icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", label: "Harga Terjangkau" },
  { icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z", label: "Order via WhatsApp" },
];

const CATEGORIES = [
  { label: "Akun Game", desc: "Akun Roblox siap pakai dengan berbagai level dan item", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
  { label: "Item Game", desc: "Pet, gamepass, dan item rare dari berbagai game populer", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
  { label: "Joki & Top Up", desc: "Jasa level up, top up saldo, dan bantuan quest favoritmu", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
];

const FEATURES = [
  { icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", title: "Transaksi Aman", desc: "Semua transaksi langsung lewat WhatsApp. Bayar, konfirmasi, terima — tanpa ribet." },
  { icon: "M13 10V3L4 14h7v7l9-11h-7z", title: "Proses Cepat", desc: "Admin aktif setiap hari. Chat langsung dibalas, proses cepat setelah pembayaran." },
  { icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", title: "Harga Bersahabat", desc: "Harga kompetitif untuk semua produk. Akun, item, joki — semuanya terjangkau." },
];

function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

export default function LandingPage() {
  return (
    <div style={{ background: "#04050B", color: "#F2F3F5", minHeight: "100vh" }}>
      <style>{`
        * { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
        @keyframes rb-spin { to { transform: translate(-50%, -50%) rotate(360deg); } }
        @keyframes n-pulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }

        /* === NAV === */
        .n-nav { display: flex; align-items: center; justify-content: space-between; max-width: 1100px; margin: 0 auto; padding: 16px 24px; }
        .n-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; color: #F2F3F5; }
        .n-logo img { width: 32px; height: 32px; border-radius: 8px; }
        .n-logo span { font-weight: 800; font-size: 17px; letter-spacing: 1px; }
        .n-nav-r { display: flex; align-items: center; gap: 4px; }
        .n-nav-link { color: #7D818B; font-size: 13px; font-weight: 600; text-decoration: none; padding: 8px 14px; border-radius: 8px; transition: color .15s; }
        .n-nav-link:hover { color: #F2F3F5; }
        .n-btn-ghost { color: #B3B8C2; font-size: 13px; font-weight: 600; text-decoration: none; padding: 8px 16px; border-radius: 8px; transition: all .15s; }
        .n-btn-ghost:hover { color: #F2F3F5; background: rgba(255,255,255,.04); }
        .n-btn-red { background: #EF4444; color: #fff; font-size: 13px; font-weight: 700; text-decoration: none; padding: 8px 20px; border-radius: 8px; transition: all .15s; }
        .n-btn-red:hover { background: #DC2626; }

        /* === HERO BANNER === */
        .n-hero { max-width: 1100px; margin: 24px auto 0; padding: 0 24px; }
        .n-banner-wrap {
          position: relative; padding: 1px; border-radius: 20px;
          background: rgba(239,68,68,.1); overflow: hidden;
        }
        .n-banner-wrap::before {
          content: ""; position: absolute; top: 50%; left: 50%;
          width: 200%; aspect-ratio: 1;
          background: conic-gradient(from 0deg, transparent 0%, transparent 70%, rgba(239,68,68,.4) 78%, rgba(239,68,68,.8) 82%, rgba(239,68,68,.4) 86%, transparent 100%);
          transform: translate(-50%, -50%);
          animation: rb-spin 4s linear infinite;
        }
        .n-banner {
          position: relative; z-index: 1;
          background: linear-gradient(135deg, #0D0E14 0%, #100A0C 100%);
          border-radius: 19px; padding: 48px 56px;
          display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 40px;
          overflow: hidden;
        }
        .n-banner::after {
          content: ""; position: absolute; top: -100px; right: -100px; width: 400px; height: 400px;
          background: radial-gradient(circle, rgba(239,68,68,.06) 0%, transparent 70%); pointer-events: none;
        }
        .n-badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 14px; background: rgba(239,68,68,.08); border-radius: 20px; font-size: 11px; font-weight: 700; color: #EF4444; letter-spacing: .5px; margin-bottom: 20px; }
        .n-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #EF4444; animation: n-pulse 2s infinite; }
        .n-banner h1 { font-size: 32px; font-weight: 800; line-height: 1.3; margin: 0 0 14px; position: relative; z-index: 1; }
        .n-banner-desc { color: #7D818B; font-size: 15px; line-height: 1.7; margin: 0 0 28px; max-width: 440px; position: relative; z-index: 1; }
        .n-banner-cta { display: flex; gap: 10px; position: relative; z-index: 1; }
        .n-cta-primary { display: inline-flex; align-items: center; gap: 8px; padding: 12px 28px; background: #EF4444; color: #fff; font-size: 14px; font-weight: 700; border-radius: 10px; text-decoration: none; transition: all .15s; }
        .n-cta-primary:hover { background: #DC2626; transform: translateY(-1px); }
        .n-cta-outline { display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; background: rgba(255,255,255,.04); color: #B3B8C2; font-size: 14px; font-weight: 600; border: 1px solid rgba(255,255,255,.08); border-radius: 10px; text-decoration: none; transition: all .15s; }
        .n-cta-outline:hover { background: rgba(255,255,255,.07); color: #F2F3F5; }
        .n-banner-logo { position: relative; z-index: 1; display: flex; justify-content: center; align-items: center; }
        .n-banner-logo img { height: 200px; width: auto; filter: drop-shadow(0 0 60px rgba(239,68,68,.12)); }

        /* === TRUST BAR === */
        .n-trust { max-width: 1100px; margin: 0 auto; padding: 24px 24px 0; }
        .n-trust-inner { display: flex; align-items: center; justify-content: center; gap: 32px; padding: 18px 0; border-bottom: 1px solid rgba(255,255,255,.04); }
        .n-trust-item { display: flex; align-items: center; gap: 8px; color: #52525B; font-size: 13px; font-weight: 500; }

        /* === SECTIONS === */
        .n-section { max-width: 1100px; margin: 0 auto; padding: 56px 24px 0; }
        .n-section-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 20px; }
        .n-section-head h2 { font-size: 18px; font-weight: 700; margin: 0; }
        .n-section-head a { color: #EF4444; font-size: 13px; font-weight: 600; text-decoration: none; }
        .n-section-head a:hover { text-decoration: underline; }

        /* === CARD WITH RUNNING BORDER === */
        .n-card {
          position: relative; padding: 1px; border-radius: 16px;
          background: rgba(255,255,255,.06); overflow: hidden;
          transition: transform .2s, box-shadow .2s; cursor: default;
        }
        .n-card::before {
          content: ""; position: absolute; top: 50%; left: 50%;
          width: 200%; aspect-ratio: 1;
          background: conic-gradient(from 0deg, transparent 0%, transparent 70%, rgba(239,68,68,.4) 78%, rgba(239,68,68,.8) 82%, rgba(239,68,68,.4) 86%, transparent 100%);
          transform: translate(-50%, -50%);
          animation: rb-spin 3s linear infinite;
          opacity: 0; transition: opacity .4s;
        }
        .n-card:hover::before { opacity: 1; }
        .n-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,0,0,.4); }
        .n-card-body {
          position: relative; z-index: 1; background: #0D0E14;
          border-radius: 15px; padding: 28px 24px; height: 100%;
        }
        .n-card-icon {
          width: 40px; height: 40px; border-radius: 10px;
          background: rgba(239,68,68,.08); color: #EF4444;
          display: flex; align-items: center; justify-content: center; margin-bottom: 16px;
        }
        .n-card-body h3 { font-size: 15px; font-weight: 700; margin: 0 0 8px; }
        .n-card-body p { color: #7D818B; font-size: 13px; line-height: 1.6; margin: 0; }

        /* === GRIDS === */
        .n-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }

        /* === CTA BOTTOM === */
        .n-cta-bottom { max-width: 1100px; margin: 0 auto; padding: 72px 24px; text-align: center; }
        .n-cta-bottom h2 { font-size: 24px; font-weight: 800; margin: 0 0 10px; }
        .n-cta-bottom p { color: #7D818B; font-size: 14px; margin: 0 0 28px; }

        /* === FOOTER === */
        .n-footer { max-width: 1100px; margin: 0 auto; padding: 24px; border-top: 1px solid rgba(255,255,255,.04); text-align: center; color: #3F3F46; font-size: 12px; }

        /* === WA FLOAT === */
        .n-wa { position: fixed; bottom: 24px; right: 24px; width: 52px; height: 52px; border-radius: 50%; background: #25D366; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 20px rgba(37,211,102,.35); z-index: 50; text-decoration: none; transition: all .15s; }
        .n-wa:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(37,211,102,.45); }

        /* === MOBILE === */
        @media (max-width: 768px) {
          .n-banner { grid-template-columns: 1fr; padding: 32px 24px; text-align: center; }
          .n-banner-desc { margin-left: auto; margin-right: auto; }
          .n-banner-cta { justify-content: center; flex-wrap: wrap; }
          .n-banner-logo { order: -1; margin-bottom: 12px; }
          .n-banner-logo img { height: 140px; }
          .n-banner h1 { font-size: 24px; }
          .n-trust-inner { flex-wrap: wrap; gap: 16px 24px; }
          .n-grid-3 { grid-template-columns: 1fr; }
          .n-section-head { flex-direction: column; gap: 8px; }
          .n-cta-bottom h2 { font-size: 20px; }
        }
      `}</style>

      {/* Navbar */}
      <nav className="n-nav">
        <Link href="/" className="n-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot/naru-icon.png" alt="Narua" />
          <span>NARUA</span>
        </Link>
        <div className="n-nav-r">
          <Link href="/store" className="n-nav-link">Katalog</Link>
          <Link href="/login" className="n-btn-ghost">Masuk</Link>
          <Link href="/register" className="n-btn-red">Daftar</Link>
        </div>
      </nav>

      {/* Hero Banner */}
      <section className="n-hero">
        <div className="n-banner-wrap">
          <div className="n-banner">
            <div>
              <div className="n-badge">
                <span className="n-badge-dot" />
                Toko Game Roblox Terpercaya
              </div>
              <h1>Jual-beli akun & item<br />game Roblox</h1>
              <p className="n-banner-desc">Tempat terpercaya untuk jual-beli akun, item, dan jasa joki Roblox. Proses cepat, langsung via WhatsApp.</p>
              <div className="n-banner-cta">
                <Link href="/store" className="n-cta-primary">
                  Lihat Katalog
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </Link>
                <a href="https://wa.me/6285172332233" target="_blank" rel="noopener" className="n-cta-outline">
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                  Chat Admin
                </a>
              </div>
            </div>
            <div className="n-banner-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mascot/logoNaru-noBG.png" alt="Narua" />
            </div>
          </div>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="n-trust">
        <div className="n-trust-inner">
          {TRUST.map((t) => (
            <div key={t.label} className="n-trust-item">
              <Icon d={t.icon} size={16} />
              {t.label}
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="n-section">
        <div className="n-section-head">
          <h2>Kategori</h2>
          <Link href="/store">Lihat semua &#8594;</Link>
        </div>
        <div className="n-grid-3">
          {CATEGORIES.map((cat) => (
            <div key={cat.label} className="n-card">
              <div className="n-card-body">
                <div className="n-card-icon"><Icon d={cat.icon} size={18} /></div>
                <h3>{cat.label}</h3>
                <p>{cat.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="n-section">
        <div className="n-section-head">
          <h2>Kenapa Narua?</h2>
        </div>
        <div className="n-grid-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="n-card">
              <div className="n-card-body">
                <div className="n-card-icon"><Icon d={f.icon} size={18} /></div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Bottom */}
      <section className="n-cta-bottom">
        <h2>Siap belanja?</h2>
        <p>Daftar sekarang dan mulai jelajahi katalog game Roblox kami.</p>
        <Link href="/register" className="n-cta-primary" style={{ fontSize: 15 }}>
          Daftar Gratis
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
        </Link>
      </section>

      {/* Footer */}
      <footer className="n-footer">
        &#169; 2024 Narua. All rights reserved.
      </footer>

      {/* Floating WhatsApp */}
      <a href="https://wa.me/6285172332233" target="_blank" rel="noopener" className="n-wa" aria-label="Chat WhatsApp">
        <svg width={26} height={26} viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
      </a>
    </div>
  );
}
