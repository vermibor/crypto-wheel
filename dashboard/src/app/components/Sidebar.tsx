"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, LayoutDashboard, LineChart, BookOpen, FileText, MoreVertical, RefreshCw, TrendingUp } from 'lucide-react';

const navItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Calendar', href: '/calendar', icon: Calendar },
  { name: 'Reports', href: '/reports', icon: FileText },
  { name: 'Trades', href: '/trades', icon: LineChart },
  { name: 'Wheel vs HODL', href: '/hodl', icon: TrendingUp },
  { name: 'Journal', href: '/journal', icon: BookOpen },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="sidebar">
        <div className="logo-container">
          <RefreshCw size={24} color="var(--accent-primary)" />
          <span>ThetaWheel</span>
        </div>

        <nav className="nav-menu">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={20} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="user-profile">
          <div className="user-avatar"></div>
          <div className="user-info">
            <div className="user-name">Wheel Bot</div>
            <div className="user-plan">Local Instance</div>
          </div>
          <MoreVertical size={16} color="var(--text-muted)" />
        </div>
      </aside>

      {/* ── Mobile bottom tab bar ── */}
      <nav className="mobile-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`mobile-nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={22} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
