'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/agents', label: 'Agents' },
  { href: '/configs', label: 'Configs' },
  { href: '/channels', label: 'Channels' },
  { href: '/tool-log', label: 'Tool Log' },
  { href: '/admin', label: 'Admin' },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-3 bg-white/70 backdrop-blur-xl border-b border-black/5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary via-teal to-accent flex items-center justify-center shadow-lg shadow-primary/20">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <h1 className="text-lg font-bold text-gray-900">TradingSwarm</h1>
      </div>
      <div className="flex gap-0.5 bg-black/[.03] rounded-2xl p-1">
        {links.map(link => (
          <Link
            key={link.href}
            href={link.href}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              pathname === link.href
                ? 'text-gray-900 bg-white shadow-sm font-semibold'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-4 text-sm font-medium">
        <span className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          0 agents live
        </span>
      </div>
    </nav>
  );
}
