"use client";

import { useState, useEffect } from "react";

export default function AnimeDicePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  return (
    <>
      <style>{`
        .ad-wrap {
          padding: 32px;
          max-width: 900px;
          margin: 0 auto;
        }
        .ad-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 32px;
        }
        .ad-icon {
          width: 56px; height: 56px; border-radius: 14px;
          background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
          display: flex; align-items: center; justify-content: center;
          font-size: 28px;
        }
        .ad-title { font-size: 28px; font-weight: 900; color: #fafafa; }
        .ad-sub { font-size: 13px; color: #71717a; margin-top: 2px; }
        .ad-card {
          background: #18181b;
          border: 1px solid #27272a;
          border-radius: 16px;
          padding: 40px;
          text-align: center;
        }
        .ad-card-icon { font-size: 48px; margin-bottom: 16px; }
        .ad-card-title { font-size: 18px; font-weight: 700; color: #a1a1aa; margin-bottom: 8px; }
        .ad-card-desc { font-size: 13px; color: #52525b; line-height: 1.6; max-width: 400px; margin: 0 auto; }
        .ad-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 999px;
          background: #6366f120;
          color: #818cf8;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .5px;
          margin-top: 16px;
        }
      `}</style>

      <div className="ad-wrap">
        <div className="ad-header">
          <div className="ad-icon">🎲</div>
          <div>
            <div className="ad-title">Anime Dice</div>
            <div className="ad-sub">Dashboard monitoring untuk Anime Dice</div>
          </div>
        </div>

        <div className="ad-card">
          <div className="ad-card-icon">🚧</div>
          <div className="ad-card-title">Coming Soon</div>
          <div className="ad-card-desc">
            Dashboard Anime Dice sedang dalam pengembangan. Monitoring akun, device management, dan fitur lainnya akan segera hadir.
          </div>
          <div className="ad-badge">DALAM PENGEMBANGAN</div>
        </div>
      </div>
    </>
  );
}
