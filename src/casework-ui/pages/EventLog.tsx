import { useEffect, useState } from 'react';
import { api } from '@ui/lib/api';
import { connectWebSocket, onEvent } from '@ui/lib/websocket';
import { WS_EVENTS } from '@shared/constants';
import type { EventRecord, ArtifactRecord } from '@shared/types';
import { ArtifactViewer } from '@ui/components/ArtifactViewer';
import { CreateCaseForm } from '@ui/components/CreateCaseForm';

interface EventWithArtifact extends EventRecord {
  artifact?: ArtifactRecord | null;
}

export function EventLog() {
  const [events, setEvents] = useState<EventWithArtifact[]>([]);
  const [ruleIds, setRuleIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await api.getPolicyPack();
      if (res.success && res.data) {
        setRuleIds((res.data as { ruleIds: string[] }).ruleIds);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const res = await api.getCases();
      if (res.success && Array.isArray(res.data)) {
        const allEvents: EventWithArtifact[] = [];
        for (const c of res.data as { id: string }[]) {
          const evRes = await api.getCaseEvents(c.id);
          if (evRes.success && Array.isArray(evRes.data)) {
            allEvents.push(...(evRes.data as EventWithArtifact[]));
          }
        }
        allEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setEvents(allEvents);
      }
    })();
  }, []);

  useEffect(() => {
    connectWebSocket();
    const unsub = onEvent(WS_EVENTS.EVENT_CREATED, (data) => {
      setEvents((prev) => [data as EventWithArtifact, ...prev]);
    });
    return unsub;
  }, []);

  const toggleExpand = async (ev: EventWithArtifact) => {
    if (expandedId === ev.id) {
      setExpandedId(null);
      return;
    }
    if (ev.artifactId && !ev.artifact) {
      const res = await api.getArtifact(ev.artifactId);
      if (res.success && res.data) {
        setEvents((prev) =>
          prev.map((e) => (e.id === ev.id ? { ...e, artifact: res.data as ArtifactRecord } : e))
        );
      }
    }
    setExpandedId(ev.id);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Benefits Casework Lab</h1>
        <CreateCaseForm ruleIds={ruleIds} onCreated={() => {}} />
      </div>

      <h2 className="text-lg font-medium mb-4 text-gray-400">Event Log</h2>

      {events.length === 0 ? (
        <p className="text-gray-500 text-sm">No events yet. Create a case to get started.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((ev) => (
            <li
              key={ev.id}
              className={`bg-gray-900 border rounded-md px-4 py-3 ${
                ev.artifactId ? 'border-gray-700 cursor-pointer hover:border-gray-600' : 'border-gray-800'
              }`}
              onClick={() => ev.artifactId && toggleExpand(ev)}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-medium text-blue-400">{ev.action}</span>
                  {ev.artifactId && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-purple-900/50 text-purple-400 rounded font-medium">
                      artifact
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(ev.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-xs text-gray-400">
                <span className="text-gray-500">actor:</span> {ev.actor}
                <span className="ml-3 text-gray-500">case:</span> {ev.caseId.slice(0, 8)}...
              </div>

              {ev.citations && ev.citations.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {ev.citations.map((c) => (
                    <span key={c} className="text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-500 rounded font-mono">
                      {c}
                    </span>
                  ))}
                </div>
              )}

              {expandedId === ev.id && ev.artifact && (
                <ArtifactViewer artifact={ev.artifact} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
