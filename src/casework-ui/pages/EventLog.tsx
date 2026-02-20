import { useEffect, useState } from 'react';
import { api } from '@ui/lib/api';
import { connectWebSocket, onEvent } from '@ui/lib/websocket';
import { WS_EVENTS } from '@shared/constants';
import type { EventRecord } from '@shared/types';

export function EventLog() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Load all events on mount
  useEffect(() => {
    (async () => {
      const res = await api.getCases();
      if (res.success && Array.isArray(res.data)) {
        const allEvents: EventRecord[] = [];
        for (const c of res.data as { id: string }[]) {
          const evRes = await api.getCaseEvents(c.id);
          if (evRes.success && Array.isArray(evRes.data)) {
            allEvents.push(...(evRes.data as EventRecord[]));
          }
        }
        allEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setEvents(allEvents);
      }
    })();
  }, []);

  // Subscribe to real-time events
  useEffect(() => {
    connectWebSocket();
    const unsub = onEvent(WS_EVENTS.EVENT_CREATED, (data) => {
      setEvents((prev) => [data as EventRecord, ...prev]);
    });
    return unsub;
  }, []);

  const handleCreateCase = async () => {
    setLoading(true);
    await api.createCase();
    setLoading(false);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Benefits Casework Lab</h1>
        <button
          onClick={handleCreateCase}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
        >
          {loading ? 'Creating...' : 'Create Case'}
        </button>
      </div>

      <h2 className="text-lg font-medium mb-4 text-gray-400">Event Log</h2>

      {events.length === 0 ? (
        <p className="text-gray-500 text-sm">No events yet. Create a case to get started.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((ev) => (
            <li key={ev.id} className="bg-gray-900 border border-gray-800 rounded-md px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-mono font-medium text-blue-400">{ev.action}</span>
                <span className="text-xs text-gray-500">
                  {new Date(ev.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-xs text-gray-400">
                <span className="text-gray-500">actor:</span> {ev.actor}
                <span className="ml-3 text-gray-500">case:</span> {ev.caseId.slice(0, 8)}...
              </div>
              {ev.payload && (
                <pre className="mt-2 text-xs text-gray-500 font-mono overflow-x-auto">
                  {JSON.stringify(ev.payload, null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
