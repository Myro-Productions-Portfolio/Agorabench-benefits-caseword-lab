// src/casework-api/routes/oracle.ts
import { Router } from 'express';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeEligibility, type OracleInput, type PolicyPackRules } from '@core/oracle';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

let _rules: PolicyPackRules | null = null;
function getRules(): PolicyPackRules {
  if (!_rules) {
    _rules = JSON.parse(
      readFileSync(
        path.join(__dirname, '../../../policy-packs/snap-illinois-fy2026-v1/rules.json'),
        'utf-8',
      ),
    ) as PolicyPackRules;
  }
  return _rules;
}

// POST /oracle/evaluate -- ad-hoc oracle evaluation
router.post('/evaluate', (req, res) => {
  const input = req.body as OracleInput;

  if (!input.householdSize || !input.householdMembers || !input.shelterCosts) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: householdSize, householdMembers, shelterCosts',
    });
  }

  const result = computeEligibility(input, getRules());
  res.json({ success: true, data: result });
});

export default router;
