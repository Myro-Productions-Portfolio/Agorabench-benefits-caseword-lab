import { Router } from 'express';
import { db } from '@db/connection';
import { runs } from '@db/schema/runs';
import { qaMismatches } from '@db/schema/qa-mismatches';
import { eq, desc } from 'drizzle-orm';
import { generateMissingDocsCases } from '@core/scenarios/missing-docs';
import { runMissingDocsScenario } from '@core/runner';
import { computeRunSummary } from '@core/metrics';
import { SCENARIOS } from '@shared/constants';

const router = Router();

// POST /runs -- create and execute a scenario run
router.post('/', async (req, res) => {
  const { scenario, count: rawCount, seed: rawSeed } = req.body as {
    scenario?: string;
    count?: number;
    seed?: number;
  };

  // --- Validate scenario ---
  if (!scenario) {
    return res
      .status(400)
      .json({ success: false, error: 'scenario is required' });
  }

  if (!(SCENARIOS as readonly string[]).includes(scenario)) {
    return res
      .status(400)
      .json({ success: false, error: `Invalid scenario. Must be one of: ${SCENARIOS.join(', ')}` });
  }

  // --- Defaults and validation ---
  const count = rawCount ?? 100;
  const seed = (rawSeed ?? Date.now()) % 2147483647;

  if (count < 1 || count > 1000) {
    return res
      .status(400)
      .json({ success: false, error: 'count must be between 1 and 1000' });
  }

  // --- Generate and run scenario ---
  const cases = generateMissingDocsCases(count, seed);
  const result = runMissingDocsScenario(cases);
  const summary = computeRunSummary(result);

  // --- Store in DB ---
  const [run] = await db
    .insert(runs)
    .values({
      scenario,
      seed,
      count,
      summary,
    })
    .returning();

  // --- Store oracle mismatches ---
  const mismatchRows: {
    runId: string;
    runnerCaseId: string;
    mismatchType: string;
    severity: string;
    runnerValue: string;
    oracleValue: string;
    detail: unknown;
  }[] = [];

  for (const cr of result.caseResults) {
    if (cr.mismatches) {
      for (const m of cr.mismatches) {
        mismatchRows.push({
          runId: run.id,
          runnerCaseId: cr.caseId,
          mismatchType: m.mismatchType,
          severity: m.severity,
          runnerValue: String(m.runnerValue),
          oracleValue: String(m.oracleValue),
          detail: m,
        });
      }
    }
  }

  if (mismatchRows.length > 0) {
    await db.insert(qaMismatches).values(mismatchRows);
  }

  res.status(201).json({
    success: true,
    data: { run, summary },
  });
});

// GET /runs -- list all runs
router.get('/', async (_req, res) => {
  const rows = await db.select().from(runs).orderBy(desc(runs.createdAt));
  res.json({ success: true, data: rows });
});

// GET /runs/:id/mismatches -- get mismatches for a run
router.get('/:id/mismatches', async (req, res) => {
  const { severity } = req.query as { severity?: string };

  const rows = await db
    .select()
    .from(qaMismatches)
    .where(eq(qaMismatches.runId, req.params.id));

  const filtered = severity
    ? rows.filter(r => r.severity === severity)
    : rows;

  res.json({ success: true, data: filtered });
});

// GET /runs/:id -- get a single run
router.get('/:id', async (req, res) => {
  const [row] = await db
    .select()
    .from(runs)
    .where(eq(runs.id, req.params.id));

  if (!row) {
    return res
      .status(404)
      .json({ success: false, error: 'Run not found' });
  }

  res.json({ success: true, data: row });
});

export default router;
