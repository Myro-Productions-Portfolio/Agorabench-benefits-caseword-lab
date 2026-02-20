import { describe, it, expect } from 'vitest';
import { loadPolicyPack } from '@core/policy-pack';
import path from 'path';

const PACK_DIR = path.resolve('policy-packs/snap-illinois-fy2026-v1');

describe('loadPolicyPack', () => {
  it('loads pack metadata', async () => {
    const pack = await loadPolicyPack(PACK_DIR);
    expect(pack.meta.packId).toBe('snap-illinois-fy2026-v1');
    expect(pack.meta.program).toBe('SNAP');
    expect(pack.meta.jurisdiction).toBe('IL');
  });

  it('loads rules with ruleIds', async () => {
    const pack = await loadPolicyPack(PACK_DIR);
    expect(pack.rules.incomeTests.grossIncomeTest.ruleId).toBe('ELIG-GROSS-001');
    expect(pack.rules.benefitFormula.ruleId).toBe('BEN-CALC-001');
  });

  it('loads SLA definitions', async () => {
    const pack = await loadPolicyPack(PACK_DIR);
    expect(pack.sla.processing.standard.slaId).toBe('SLA-PROC-001');
    expect(pack.sla.processing.standard.maxCalendarDays).toBe(30);
  });

  it('loads citation sources', async () => {
    const pack = await loadPolicyPack(PACK_DIR);
    expect(pack.citations.sources.length).toBeGreaterThan(0);
    expect(pack.citations.sources[0].citationId).toBe('CFR-273');
  });

  it('builds ruleIndex containing all ruleIds, slaIds, and citationIds', async () => {
    const pack = await loadPolicyPack(PACK_DIR);
    // ruleIds from rules.json
    expect(pack.ruleIndex.has('ELIG-GROSS-001')).toBe(true);
    expect(pack.ruleIndex.has('BEN-CALC-001')).toBe(true);
    expect(pack.ruleIndex.has('VER-MAND-001')).toBe(true);
    expect(pack.ruleIndex.has('NOT-APPR-001')).toBe(true);
    // slaIds from sla.json
    expect(pack.ruleIndex.has('SLA-PROC-001')).toBe(true);
    expect(pack.ruleIndex.has('SLA-APP-001')).toBe(true);
    // citationIds from citations.json
    expect(pack.ruleIndex.has('CFR-273')).toBe(true);
    // unknown IDs should not be present
    expect(pack.ruleIndex.has('FAKE-001')).toBe(false);
  });

  it('throws on missing directory', async () => {
    await expect(loadPolicyPack('/nonexistent/path')).rejects.toThrow();
  });
});
