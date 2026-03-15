'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NewConfigPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to create config');
        return;
      }
      const config = await res.json();
      router.push(`/configs/${config.config_id}/edit`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="p-8 max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/configs" className="text-gray-400 hover:text-gray-600 transition-colors text-sm">
          Configs
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-[28px] font-bold text-gray-900">New Config</h1>
      </div>

      <div className="bg-white/70 backdrop-blur-2xl border border-black/5 rounded-[20px] p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. aggressive-research"
            className="w-full px-3.5 py-2.5 rounded-xl border border-black/10 bg-white/80 text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What does this config do?"
            rows={3}
            className="w-full px-3.5 py-2.5 rounded-xl border border-black/10 bg-white/80 text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none resize-none"
          />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex gap-2 pt-2">
          <Link
            href="/configs"
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-black/[.05] text-gray-900 hover:bg-black/[.08] transition-all"
          >
            Cancel
          </Link>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary-dark transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/30 disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create & Open Editor'}
          </button>
        </div>
      </div>
    </main>
  );
}
