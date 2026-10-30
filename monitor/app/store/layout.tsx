"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div style={{ background: "#09090b", color: "#fafafa", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`
        .store-nav { display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; border-bottom: 1px solid #1c1c1e; position: sticky; top: 0; background: #09090bee; backdrop-filter: blur(12px); z-index: 50; }
        .store-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; color: #fafafa; }
        .store-logo-icon { width: 32px; height: 32px; border-radius: 8px; overflow: hidden; }
        .store-logo-text { font-family: var(--font-bebas), system-ui; font-size: 22px; letter-spacing: 1px; }
        .store-nav-actions { display: flex; align-items: center; gap: 8px; }
        .store-nav-btn { padding: 7px 16px; border-radius: 8px; font-size: 12px; font-weight: 700; text-decoration: none; border: none; cursor: pointer; transition: all .15s; }
        .store-nav-btn.ghost { background: transparent; color: #a1a1aa; }
        .store-nav-btn.ghost:hover { color: #fafafa; }
        .store-nav-btn.outline { background: transparent; color: #ef4444; border: 1px solid #ef4444; }
        .store-nav-btn.outline:hover { background: #ef444420; }
        .store-footer { border-top: 1px solid #1c1c1e; padding: 20px 24px; text-align: center; color: #52525b; font-size: 12px; margin-top: auto; }
        .store-wa-float { position: fixed; bottom: 24px; right: 24px; width: 52px; height: 52px; border-radius: 50%; background: #25D366; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 20px rgba(37,211,102,.4); z-index: 50; transition: transform .15s; text-decoration: none; }
        .store-wa-float:hover { transform: scale(1.1); }
      `}</style>

      <nav className="store-nav">
        <Link href="/" className="store-logo">
          <div className="store-logo-icon">
            <Image src="/mascot/naru-icon.png" alt="Narua" width={32} height={32} />
          </div>
          <span className="store-logo-text">NARUA</span>
        </Link>
        <div className="store-nav-actions">
          <Link href="/store" className="store-nav-btn ghost">Katalog</Link>
          <button onClick={handleLogout} className="store-nav-btn outline">Logout</button>
        </div>
      </nav>

      <main style={{ flex: 1 }}>
        {children}
      </main>

      <footer className="store-footer">
        &copy; {new Date().getFullYear()} Narua. All rights reserved.
      </footer>

      <a href="https://wa.me/6285172332233" target="_blank" rel="noopener" className="store-wa-float" aria-label="Chat WhatsApp">
        <svg width={24} height={24} viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
      </a>
    </div>
  );
}
