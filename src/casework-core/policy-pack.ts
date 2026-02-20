import { readFile } from 'fs/promises';
import path from 'path';

// --- Types ---

export interface PackMeta {
  packId: string;
  program: string;
  jurisdiction: string;
  version: string;
  effectiveDate: string;
  expirationDate: string;
  federalBasis: string;
  stateManualUrl: string;
  createdAt: string;
}

export interface CitationSource {
  citationId: string;
  title: string;
  url: string;
  accessDate: string;
  type: string;
}

export interface PolicyPack {
  meta: PackMeta;
  rules: Record<string, unknown>;
  sla: Record<string, unknown>;
  citations: { sources: CitationSource[] };
  ruleIndex: Set<string>;
}

// --- Loader ---

async function readJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

function extractIds(obj: unknown, keys: string[]): string[] {
  const ids: string[] = [];
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (keys.includes(k) && typeof v === 'string') {
        ids.push(v);
      }
      if (v && typeof v === 'object') {
        ids.push(...extractIds(v, keys));
      }
    }
  }
  return ids;
}

export async function loadPolicyPack(packDir: string): Promise<PolicyPack> {
  const [meta, rules, sla, citations] = await Promise.all([
    readJson(path.join(packDir, 'pack.json')) as Promise<PackMeta>,
    readJson(path.join(packDir, 'rules.json')) as Promise<Record<string, unknown>>,
    readJson(path.join(packDir, 'sla.json')) as Promise<Record<string, unknown>>,
    readJson(path.join(packDir, 'citations.json')) as Promise<PolicyPack['citations']>,
  ]);

  const ruleIds = extractIds(rules, ['ruleId']);
  const slaIds = extractIds(sla, ['slaId']);
  const citationIds = extractIds(citations, ['citationId']);
  const ruleIndex = new Set([...ruleIds, ...slaIds, ...citationIds]);

  return { meta, rules, sla, citations, ruleIndex };
}
