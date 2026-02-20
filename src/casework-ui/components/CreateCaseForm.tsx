import { useState } from 'react';
import { api } from '@ui/lib/api';

export function CreateCaseForm({ ruleIds, onCreated }: { ruleIds: string[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [citation, setCitation] = useState('CFR-273');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    const res = await api.createCase([citation]);
    setLoading(false);
    if (res.success) {
      setOpen(false);
      onCreated();
    } else {
      setError(res.error || 'Failed to create case');
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-md transition-colors"
      >
        Create Case
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={citation}
        onChange={(e) => setCitation(e.target.value)}
        className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1.5"
      >
        {ruleIds.map((id) => (
          <option key={id} value={id}>{id}</option>
        ))}
      </select>
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors"
      >
        {loading ? '...' : 'Submit'}
      </button>
      <button
        onClick={() => setOpen(false)}
        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
