"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

interface NavGroup {
  label: string;
  icon: string;
  items: NavItem[];
}

type NavEntry = NavItem | NavGroup;

function isGroup(e: NavEntry): e is NavGroup {
  return "items" in e;
}

const NAV: NavEntry[] = [
  { label: "Dashboard", href: "/", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" },
  { label: "Katalog Akun", href: "/catalog", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
  {
    label: "Termux",
    icon: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    items: [
      { label: "Devices", href: "/termux", icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
      { label: "Generate Command", href: "/termux-packages", icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" },
    ],
  },
  { label: "Poster", href: "/poster", icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" },
];

function SvgIcon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Termux: true });

  function toggleGroup(label: string) {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  function isGroupActive(group: NavGroup) {
    return group.items.some((item) => isActive(item.href));
  }

  return (
    <>
      <style>{`
        .sidebar {
          width: ${collapsed ? "64px" : "240px"};
          min-height: 100vh;
          background: #0d0d16;
          border-right: 1px solid #1e1e30;
          display: flex;
          flex-direction: column;
          transition: width .2s ease;
          position: fixed;
          top: 0;
          left: 0;
          z-index: 100;
          overflow-y: auto;
          overflow-x: hidden;
        }
        .sb-header {
          padding: 20px ${collapsed ? "12px" : "20px"};
          border-bottom: 1px solid #1e1e30;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .sb-logo {
          width: 36px; height: 36px; border-radius: 10px;
          background: linear-gradient(135deg, #a78bfa 0%, #22d3ee 100%);
          display: flex; align-items: center; justify-content: center;
          font-weight: 900; font-size: 14px; color: #0b0b12;
          flex-shrink: 0;
        }
        .sb-brand { overflow: hidden; white-space: nowrap; }
        .sb-title { font-size: 16px; font-weight: 900; color: #e8e8f0; letter-spacing: .5px; }
        .sb-sub { font-size: 10px; color: #8b8ba3; font-weight: 600; letter-spacing: .5px; }
        .sb-toggle {
          margin-left: auto; background: none; border: none; color: #8b8ba3;
          cursor: pointer; padding: 4px; border-radius: 6px; flex-shrink: 0;
        }
        .sb-toggle:hover { color: #e8e8f0; background: #1e1e30; }

        .sb-nav { padding: 12px 8px; flex: 1; }
        .sb-label {
          font-size: 10px; font-weight: 700; color: #555570; letter-spacing: 1px;
          padding: 12px 12px 6px; text-transform: uppercase;
        }
        .sb-item {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 12px; border-radius: 10px; color: #8b8ba3;
          text-decoration: none; font-size: 13px; font-weight: 600;
          cursor: pointer; transition: all .12s; margin-bottom: 2px;
          border: none; background: none; width: 100%; text-align: left;
        }
        .sb-item:hover { color: #e8e8f0; background: #16162a; }
        .sb-item.active { color: #22d3ee; background: #111128; }
        .sb-item .sb-icon { flex-shrink: 0; width: 20px; display: flex; align-items: center; justify-content: center; }
        .sb-item .sb-text { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .sb-chevron { margin-left: auto; transition: transform .2s; flex-shrink: 0; }
        .sb-chevron.open { transform: rotate(90deg); }

        .sb-subitems { padding-left: ${collapsed ? "0" : "18px"}; }
        .sb-subitem {
          display: flex; align-items: center; gap: 10px;
          padding: 7px 12px; border-radius: 8px; color: #6b6b88;
          text-decoration: none; font-size: 12px; font-weight: 600;
          transition: all .12s; margin-bottom: 1px;
        }
        .sb-subitem:hover { color: #e8e8f0; background: #16162a; }
        .sb-subitem.active { color: #22d3ee; background: #111128; }
        .sb-subitem .sb-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #333350;
          flex-shrink: 0;
        }
        .sb-subitem.active .sb-dot { background: #22d3ee; box-shadow: 0 0 6px #22d3ee; }

        .sb-footer {
          padding: 16px ${collapsed ? "12px" : "20px"};
          border-top: 1px solid #1e1e30;
        }
        .sb-user { display: flex; align-items: center; gap: 10px; }
        .sb-avatar {
          width: 32px; height: 32px; border-radius: 8px;
          background: #262640; display: flex; align-items: center; justify-content: center;
          font-weight: 800; font-size: 12px; color: #a78bfa; flex-shrink: 0;
        }
        .sb-uname { font-size: 12px; font-weight: 700; color: #e8e8f0; }
        .sb-urole { font-size: 10px; color: #22d3ee; font-weight: 600; }

        .sb-main {
          margin-left: ${collapsed ? "64px" : "240px"};
          transition: margin-left .2s ease;
          min-height: 100vh;
        }

        @media (max-width: 768px) {
          .sidebar { width: 64px !important; }
          .sb-main { margin-left: 64px !important; }
          .sb-brand, .sb-text, .sb-chevron, .sb-uname, .sb-urole, .sb-label { display: none !important; }
          .sb-subitems { padding-left: 0 !important; }
        }
      `}</style>

      <nav className="sidebar">
        <div className="sb-header">
          <div className="sb-logo">NH</div>
          {!collapsed && (
            <div className="sb-brand">
              <div className="sb-title">NARUHUB</div>
              <div className="sb-sub">CONTROL DASHBOARD</div>
            </div>
          )}
          <button className="sb-toggle" onClick={() => setCollapsed(!collapsed)} title={collapsed ? "Expand" : "Collapse"}>
            <SvgIcon d={collapsed ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"} size={16} />
          </button>
        </div>

        <div className="sb-nav">
          {!collapsed && <div className="sb-label">Main Menu</div>}
          {NAV.map((entry) => {
            if (isGroup(entry)) {
              const groupOpen = openGroups[entry.label] ?? false;
              const groupActive = isGroupActive(entry);
              return (
                <div key={entry.label}>
                  <button
                    className={`sb-item ${groupActive ? "active" : ""}`}
                    onClick={() => toggleGroup(entry.label)}
                  >
                    <span className="sb-icon"><SvgIcon d={entry.icon} /></span>
                    {!collapsed && <span className="sb-text">{entry.label}</span>}
                    {!collapsed && (
                      <span className={`sb-chevron ${groupOpen ? "open" : ""}`}>
                        <SvgIcon d="M9 5l7 7-7 7" size={12} />
                      </span>
                    )}
                  </button>
                  {(groupOpen || collapsed) && (
                    <div className="sb-subitems">
                      {entry.items.map((item) => (
                        <a
                          key={item.href}
                          href={item.href}
                          className={`sb-subitem ${isActive(item.href) ? "active" : ""}`}
                        >
                          {collapsed ? (
                            <span className="sb-icon"><SvgIcon d={item.icon} size={16} /></span>
                          ) : (
                            <>
                              <span className="sb-dot" />
                              <span>{item.label}</span>
                            </>
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <a
                key={entry.href}
                href={entry.href}
                className={`sb-item ${isActive(entry.href) ? "active" : ""}`}
              >
                <span className="sb-icon"><SvgIcon d={entry.icon} /></span>
                {!collapsed && <span className="sb-text">{entry.label}</span>}
              </a>
            );
          })}
        </div>

        <div className="sb-footer">
          <div className="sb-user">
            <div className="sb-avatar">NR</div>
            {!collapsed && (
              <div>
                <div className="sb-uname">NaruHub</div>
                <div className="sb-urole">ADMIN</div>
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
