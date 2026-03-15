interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: 'green' | 'purple' | 'teal' | 'orange' | 'default';
  hero?: boolean;
}

const colorClasses: Record<string, string> = {
  green: 'text-emerald-600',
  purple: 'text-primary',
  teal: 'text-teal',
  orange: 'text-accent',
  default: 'text-gray-900',
};

export function StatCard({ label, value, sub, color = 'default', hero }: StatCardProps) {
  return (
    <div className={`bg-white/70 border border-black/5 rounded-2xl p-5 backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 ${hero ? 'bg-gradient-to-br from-primary/[.04] to-teal/[.04] border-primary/10' : ''}`}>
      <div className="text-[0.65rem] uppercase tracking-widest text-gray-400 font-semibold">{label}</div>
      <div className={`font-mono font-bold mt-2 ${hero ? 'text-3xl' : 'text-xl'} ${colorClasses[color]}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}
