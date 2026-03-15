const colors = ['purple', 'green', 'red', 'teal', 'pink', 'orange'] as const;
const colorMap: Record<string, string> = {
  purple: 'bg-primary/10 text-primary',
  green: 'bg-emerald-50 text-emerald-600',
  red: 'bg-red-50 text-red-500',
  teal: 'bg-teal/10 text-teal',
  pink: 'bg-fuchsia-50 text-fuchsia-500',
  orange: 'bg-accent/10 text-accent',
};

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

export function AgentBadge({ name, variant }: { name: string; variant?: string }) {
  const color = variant ?? colors[Math.abs(hashCode(name)) % colors.length];
  return <span className={`font-mono text-xs font-bold px-2.5 py-0.5 rounded-lg ${colorMap[color] ?? colorMap.purple}`}>{name}</span>;
}
