# M3 Oracle + Determination Worksheet Design

**Date:** 2026-02-20
**Goal:** Implement a deterministic SNAP eligibility/benefit oracle, integrate it with the scenario runner for mismatch detection, and produce determination worksheet artifacts with full calculation audit trails.
**Exit criteria:** Oracle mismatch auto-creates QA tasks; mismatch rate is measurable and displayed.

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Oracle role | Scoring only | Not a guard on /transition. Simpler, matches exit criteria. Guard enforcement is a later milestone. |
| Case data generation | Seeded random (mulberry32) | Deterministic, diverse financial profiles, extends existing PRNG infrastructure. |
| Mismatch definition | Runner vs oracle | Runner makes scripted approve/deny. Oracle computes real answer. Natural mismatches since runner decisions are simplified. |
| Worksheet artifact | Enhance existing determination_worksheet | No schema changes. Flesh out content with oracle's full calculation steps. |
| Expedited processing | Deferred to M4+ | Missing-docs scenario doesn't use it. Adds complexity without value for M3. |
| Architecture | Core oracle + lightweight QA tracking | Pure function in casework-core + qa_mismatches table + ad-hoc API endpoint. Balanced scope. |

---

## 1. Oracle Pure Function

Pure function in `src/casework-core/oracle.ts`:

```typescript
function computeEligibility(
  input: OracleInput,
  rules: PolicyPackRules
): OracleOutput
```

### Algorithm (17 steps, skip step 17 proration for M3)

1. Classify household (elderly/disabled flag)
2. Convert income to monthly
3. Calculate gross income
4. Resource test (fail fast: ELIG-RES-001/002)
5. Gross income test (fail fast: ELIG-GROSS-001, 165% FPL or 200% for elderly/disabled)
6. Standard deduction (by household size)
7. Earned income deduction (20% of gross earned)
8. Dependent care deduction
9. Child support deduction
10. Medical deduction (elderly/disabled only, $35 threshold)
11. Excess shelter deduction (capped at $744 for non-elderly/disabled)
12. Net income = max(0, adjusted)
13. Net income test (fail fast: ELIG-NET-001, 100% FPL)
14. Benefit = max_allotment - (0.30 * net_income)
15. Minimum benefit ($24 for 1-2 person households)
16. Final eligibility check

Each step produces a `CalculationStep` audit record. All parameters read from `rules.json`. No side effects.

### Types

- `OracleInput`: householdSize, householdMembers[], income[], resources[], shelterCosts, medicalExpenses?, dependentCareCosts?, childSupportPaid?, applicationDate, policyPackId
- `OracleOutput`: eligible, reason?, failedTests[], grossIncome, netIncome, benefitAmount, deductions (DeductionBreakdown), citedRules[], calculationSteps[]
- `CalculationStep`: stepNumber, description, ruleId, inputs, output, formula?
- `DeductionBreakdown`: standardDeduction, earnedIncomeDeduction, dependentCareDeduction, childSupportDeduction, medicalDeduction, excessShelterDeduction, totalDeductions, shelterCostDetail

---

## 2. Extended Case Data & Scenario Generator

The scenario generator (`scenarios/missing-docs.ts`) is extended to produce financial profiles alongside existing verification data. The seeded PRNG generates:

- 1-6 household members with random ages (some elderly/disabled for deduction diversity)
- 1-3 income items in realistic ranges ($800-$3500/month earned, $200-$1200 unearned)
- Resources ($0-$5000, sometimes over limit)
- Shelter costs with SUA tier selection
- Optional medical/dependent care/child support deductions

The existing `CaseData` interface for the state machine stays unchanged. `OracleInput` is a separate, richer structure produced by the generator alongside the case config.

---

## 3. Runner Integration & Oracle Comparison

For every case reaching a determination (approve/deny), the runner:

1. Builds `OracleInput` from the case's financial data
2. Calls `computeEligibility(input, rules)` directly (no HTTP)
3. Compares the runner's scripted decision against the oracle's answer
4. Produces an `OracleComparison` record

Mismatches occur naturally: the runner approves all on-time/late cases and denies refusals, but the oracle does the real math -- some approved cases may be ineligible, some denied cases might be eligible.

```typescript
interface OracleComparison {
  eligibilityMatch: boolean;
  benefitMatch: boolean;
  benefitDelta: number;
  deductionMatches: { deductionType: string; agentValue: number; oracleValue: number; matches: boolean }[];
  missingDeductions: string[];
  extraDeductions: string[];
  citationsCovered: boolean;
  missingCitations: string[];
}
```

CaseResult gains `oracleOutput?` and `oracleComparison?`. Abandoned cases skip the oracle.

---

## 4. QA Mismatches & Persistence

### DB Table

```
qa_mismatches:
  id              uuid PK
  run_id          uuid FK -> runs
  runner_case_id  text
  mismatch_type   text  -- 'eligibility' | 'benefit_amount' | 'deduction' | 'citation'
  severity        text  -- 'critical' | 'high' | 'medium' | 'low'
  runner_value    text
  oracle_value    text
  detail          jsonb -- full OracleComparison
  created_at      timestamptz
```

### Severity Rules

- **critical**: eligibility mismatch (approved when should be denied, or vice versa)
- **high**: benefit amount delta > $50
- **medium**: benefit amount delta $1-$50 or missing deduction
- **low**: missing citation only

### RunSummary Extension

```typescript
oracleMetrics: {
  casesEvaluated: number;
  eligibilityMatchRate: number;
  benefitExactMatchRate: number;
  averageBenefitDelta: number;
  mismatchCount: number;
  mismatchesBySeverity: Record<string, number>;
}
```

---

## 5. API Endpoints & UI

### New Endpoints

- `POST /api/oracle/evaluate` -- Ad-hoc oracle evaluation. Accepts OracleInput, returns OracleOutput.
- `GET /api/runs/:id/mismatches` -- QA mismatches for a run, filterable by severity.

### Existing Changes

- `POST /api/runs` -- Internally invokes oracle and stores mismatches. Response summary includes oracleMetrics.

### UI Additions

- **RunSummaryCard** -- New "Oracle Accuracy" section: eligibility match rate, benefit exact match rate, avg benefit delta, mismatch count by severity.
- **Mismatch list** -- Expandable section below summary card. Severity badges (critical=red, high=orange, medium=yellow, low=gray). Each row: case ID, type, runner value vs oracle value.

No new pages. Everything extends the existing EventLog page run results area.

---

## 6. Determination Worksheet Artifact

The existing `determination_worksheet` artifact type gets full content:

```typescript
{
  type: 'determination_worksheet',
  content: {
    applicant: string;
    householdSize: number;
    eligible: boolean;
    benefitAmount: number;
    grossIncome: number;
    netIncome: number;
    deductions: DeductionBreakdown;
    calculationSteps: CalculationStep[];
    citedRules: string[];
    oracleVersion: string;
  }
}
```

Generated by the runner at determination time. Attached to the determination event and visible in the ArtifactViewer as structured JSON.

---

## 7. Testing Strategy

### Unit Tests (casework-core/)

- Oracle: each calculation step in isolation (income conversion, resource test, gross income test, all 6 deduction types, net income test, benefit calc, minimum benefit)
- Full pipeline: 10+ diverse cases (single person no income, family mixed income, elderly/disabled, boundary income, high shelter, over-resource)
- Scenario generator: produces valid OracleInput for every case, deterministic
- Oracle comparison: matching/mismatching cases produce correct records
- Mismatch severity: correctly assigned

### Integration Tests (API)

- POST /api/oracle/evaluate: correct output, 400 for invalid input
- GET /api/runs/:id/mismatches: returns stored mismatches
- POST /api/runs: summary includes oracleMetrics

### E2E Verification

- Run 100 cases, oracle metrics computed and non-trivial
- Mismatch rate > 0% (natural mismatches from simplified runner decisions)
- UI shows oracle accuracy section and mismatch list
