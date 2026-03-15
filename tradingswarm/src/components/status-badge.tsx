export function StatusBadge({ status }: { status: 'running' | 'stopped' | 'failed' }) {
  const styles: Record<string, string> = {
    running: 'bg-emerald-50 text-emerald-600',
    stopped: 'bg-gray-100 text-gray-400',
    failed: 'bg-red-50 text-red-500',
  };
  return <span className={`text-xs font-semibold px-3 py-1 rounded-full ${styles[status]}`}>{status}</span>;
}
