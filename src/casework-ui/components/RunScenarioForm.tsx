import { useState } from 'react';
import { api } from '@ui/lib/api';

interface Props {
  onComplete: (summary: any, data?: any) => void;
}

export function RunScenarioForm({ onComplete }: Props) {
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState('missing_docs');
  const [count, setCount] = useState(100);
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    const res = await api.startRun(scenario, count);
    setRunning(false);
    if (res.success && res.data) {
      onComplete((res.data as any).summary, res.data);
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="px-3 py-1.5 bg-green-700 text-white text-sm rounded hover:bg-green-600">
        Run Scenario
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select value={scenario} onChange={(e) => setScenario(e.target.value)}
        className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white">
        <option value="missing_docs">Missing Docs</option>
        <option value="appeal_reversal">Appeal Reversal</option>
      </select>
      <label className="text-sm text-gray-400">Cases:</label>
      <input type="number" value={count} onChange={(e) => setCount(Number(e.target.value))}
        min={1} max={1000} className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white" />
      <button onClick={handleRun} disabled={running}
        className="px-3 py-1.5 bg-green-700 text-white text-sm rounded hover:bg-green-600 disabled:opacity-50">
        {running ? 'Running...' : 'Start'}
      </button>
      <button onClick={() => setOpen(false)} className="px-3 py-1.5 bg-gray-700 text-white text-sm rounded hover:bg-gray-600">
        Cancel
      </button>
    </div>
  );
}
