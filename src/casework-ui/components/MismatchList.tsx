import { useState, useEffect } from 'react';
import { api } from '@ui/lib/api';

interface Mismatch {
  id: string;
  runnerCaseId: string;
  mismatchType: string;
  severity: string;
  runnerValue: string;
  oracleValue: string;
}

interface Props {
  runId: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-900/50 text-red-400',
  high: 'bg-orange-900/50 text-orange-400',
  medium: 'bg-yellow-900/50 text-yellow-400',
  low: 'bg-gray-700 text-gray-400',
};

export function MismatchList({ runId }: Props) {
  const [mismatches, setMismatches] = useState<Mismatch[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await api.getRunMismatches(runId);
      if (res.success && Array.isArray(res.data)) {
        setMismatches(res.data as Mismatch[]);
      }
    })();
  }, [runId]);

  if (mismatches.length === 0) return null;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-sm font-medium text-gray-300 hover:text-white"
      >
        {expanded ? '- ' : '+ '}QA Mismatches ({mismatches.length})
      </button>
      {expanded && (
        <div className="mt-3 space-y-2">
          {mismatches.slice(0, 20).map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-xs">
              <span className={`px-1.5 py-0.5 rounded ${SEVERITY_COLORS[m.severity] ?? SEVERITY_COLORS.low}`}>
                {m.severity}
              </span>
              <span className="text-gray-500 font-mono">{m.runnerCaseId.slice(0, 8)}...</span>
              <span className="text-gray-400">{m.mismatchType}:</span>
              <span className="text-red-400">{String(m.runnerValue)}</span>
              <span className="text-gray-600">vs</span>
              <span className="text-green-400">{String(m.oracleValue)}</span>
            </div>
          ))}
          {mismatches.length > 20 && (
            <div className="text-xs text-gray-500">...and {mismatches.length - 20} more</div>
          )}
        </div>
      )}
    </div>
  );
}
