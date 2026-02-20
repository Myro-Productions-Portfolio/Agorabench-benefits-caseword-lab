# Deterministic Oracle Specification

The oracle is a non-LLM rules engine that computes expected SNAP eligibility and benefit outcomes. It operates exclusively against a loaded policy pack and structured case data. The oracle serves two purposes: (1) benchmark scoring -- comparing agent decisions to ground truth, and (2) guard enforcement -- blocking determinations that contradict the rules.

---

## 1. Oracle Interface

```typescript
interface OracleInput {
  householdSize: number;
  householdMembers: HouseholdMember[];
  income: IncomeItem[];
  resources: ResourceItem[];
  shelterCosts: ShelterCosts;
  medicalExpenses?: number;       // monthly, elderly/disabled only
  dependentCareCosts?: number;    // monthly
  childSupportPaid?: number;      // monthly
  applicationDate: string;        // ISO date
  isExpedited: boolean;
  policyPackId: string;
}

interface HouseholdMember {
  age: number;
  isDisabled: boolean;
  isStudent: boolean;
  citizenshipStatus: 'citizen' | 'qualified_alien' | 'ineligible';
}

interface IncomeItem {
  type: 'earned' | 'unearned' | 'excluded';
  amount: number;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'annual';
  source: string;
  verified: boolean;
}

interface ResourceItem {
  type: string;
  value: number;
  countable: boolean;
}

interface ShelterCosts {
  rent?: number;
  mortgage?: number;
  propertyTax?: number;        // monthly share
  insurance?: number;          // structure insurance, monthly
  condoFees?: number;
  suaTier: 'heatingCooling' | 'limitedUtility' | 'singleUtility' | 'telephoneOnly' | 'none';
}

interface OracleOutput {
  eligible: boolean;
  reason?: string;              // if ineligible, the specific reason
  failedTests: FailedTest[];    // which tests failed and why
  grossIncome: number;
  netIncome: number;
  benefitAmount: number;        // 0 if ineligible
  proratedAmount?: number;      // if initial month proration applies
  deductions: DeductionBreakdown;
  citedRules: string[];         // all ruleIds used in calculation
  calculationSteps: CalculationStep[];  // full audit trail
  expeditedEligible: boolean;
  expeditedReason?: string;
}
```

---

## 2. Calculation Algorithm

The oracle executes these steps in strict order. Each step produces a `CalculationStep` record for the audit trail.

### Step 1: Classify Household

```
hasQualifyingMember = any member where (age >= 60 OR isDisabled)
isElderlyOrDisabled = hasQualifyingMember
householdSize = count of eligible members (exclude ineligible aliens)
```

**Rule:** ELIG-FPL-001

### Step 2: Convert Income to Monthly

```
for each income item:
  if frequency == 'weekly':     monthlyAmount = amount * 4.3
  if frequency == 'biweekly':   monthlyAmount = amount * 2.15
  if frequency == 'monthly':    monthlyAmount = amount
  if frequency == 'annual':     monthlyAmount = amount / 12
```

**Rule:** INC-CONV-001

### Step 3: Calculate Gross Income

```
grossEarned = sum of all earned income (monthly)
grossUnearned = sum of all unearned income (monthly)
grossIncome = grossEarned + grossUnearned
```

(Excluded income types are not included in the sum.)

### Step 4: Resource Test

```
countableResources = sum of all resources where countable == true

if hasQualifyingMember:
  resourceLimit = rules.resourceLimits.withQualifyingMember.limit  (4500)
else:
  resourceLimit = rules.resourceLimits.standard.limit  (3000)

if countableResources > resourceLimit:
  FAIL: ELIG-RES-001 or ELIG-RES-002
  return { eligible: false, reason: "Resources exceed limit" }
```

**Rules:** ELIG-RES-001, ELIG-RES-002

### Step 5: Gross Income Test

```
fplMonthly = rules.fplTable.monthlyByHouseholdSize[householdSize]
  (for sizes > 8: fplTable[8] + (householdSize - 8) * additionalMember)

if hasQualifyingMember:
  grossLimit = fplMonthly * (rules.incomeTests.grossIncomeTest.thresholdPctFplWithQM / 100)
  // 200% FPL
else:
  grossLimit = fplMonthly * (rules.incomeTests.grossIncomeTest.thresholdPctFpl / 100)
  // 165% FPL

if grossIncome > grossLimit:
  FAIL: ELIG-GROSS-001
  return { eligible: false, reason: "Gross income exceeds limit" }
```

**Rule:** ELIG-GROSS-001

Note: Categorically eligible households (BBCE) may be exempt from the gross income test per `exemptIfCategoricallyEligible`. The oracle checks this flag.

### Step 6: Apply Standard Deduction

```
if householdSize <= 3: standardDeduction = rules.deductions.standard.byHouseholdSize["1"]  (205)
if householdSize == 4: standardDeduction = rules.deductions.standard.byHouseholdSize["4"]  (219)
if householdSize == 5: standardDeduction = rules.deductions.standard.byHouseholdSize["5"]  (257)
if householdSize >= 6: standardDeduction = rules.deductions.standard.byHouseholdSize["6"]  (295)

adjustedIncome = grossIncome - standardDeduction
```

**Rule:** DED-STD-001

### Step 7: Apply Earned Income Deduction

```
earnedIncomeDeduction = floor(grossEarned * rules.deductions.earnedIncome.rate)
// 20% of gross earned income

adjustedIncome = adjustedIncome - earnedIncomeDeduction
```

**Rule:** DED-EARN-001

### Step 8: Apply Dependent Care Deduction

```
dependentCareDeduction = dependentCareCosts (if claimed and verified)

adjustedIncome = adjustedIncome - dependentCareDeduction
```

**Rule:** DED-DEP-001

### Step 9: Apply Child Support Deduction

```
childSupportDeduction = childSupportPaid (if claimed and verified)

adjustedIncome = adjustedIncome - childSupportDeduction
```

**Rule:** DED-CS-001

Note: Illinois treats child support as a deduction, not an income exclusion.

### Step 10: Apply Medical Deduction (Elderly/Disabled Only)

```
if isElderlyOrDisabled AND medicalExpenses > 0:
  medicalDeduction = max(0, medicalExpenses - rules.deductions.medical.threshold)
  // Subtract $35 threshold
else:
  medicalDeduction = 0

adjustedIncome = adjustedIncome - medicalDeduction
```

**Rule:** DED-MED-001

Note: Illinois offers standard medical deductions ($485 group home, $185 community) as alternatives to itemized.

### Step 11: Calculate Excess Shelter Deduction

```
suaAmount = rules.utilityAllowances.tiers[shelterCosts.suaTier] (or 0 if 'none')

totalShelterCosts = (shelterCosts.rent || 0)
                  + (shelterCosts.mortgage || 0)
                  + (shelterCosts.propertyTax || 0)
                  + (shelterCosts.insurance || 0)
                  + (shelterCosts.condoFees || 0)
                  + suaAmount

halfAdjusted = adjustedIncome * rules.deductions.excessShelter.incomeMultiplier  // 0.50
excessShelter = max(0, totalShelterCosts - halfAdjusted)

if NOT isElderlyOrDisabled:
  excessShelter = min(excessShelter, rules.deductions.excessShelter.cap)  // 744
// Elderly/disabled: no cap

adjustedIncome = adjustedIncome - excessShelter
```

**Rule:** DED-SHLT-001

If the household is homeless and not paying specific shelter costs, the homeless shelter deduction applies instead:

```
if isHomeless AND no specific shelter costs:
  excessShelter = rules.deductions.homelessShelter.standardAmount  // 199
```

**Rule:** DED-HMLS-001

### Step 12: Net Income = Final Adjusted Income

```
netIncome = max(0, adjustedIncome)
```

### Step 13: Net Income Test

```
netIncomeLimit = fplMonthly * (rules.incomeTests.netIncomeTest.thresholdPctFpl / 100)
// 100% FPL

if netIncome > netIncomeLimit:
  FAIL: ELIG-NET-001
  return { eligible: false, reason: "Net income exceeds 100% FPL" }
```

**Rule:** ELIG-NET-001

### Step 14: Calculate Benefit Amount

```
maxAllotment = rules.maxAllotments.monthlyByHouseholdSize[householdSize]
  (for sizes > 10: maxAllotments[10] + (householdSize - 10) * additionalMember)

expectedContribution = netIncome * rules.benefitFormula.contributionRate  // 0.30
benefitAmount = floor(maxAllotment - expectedContribution)
```

**Rule:** BEN-CALC-001, BEN-ALLOT-001

### Step 15: Apply Minimum Benefit

```
if householdSize <= 2 AND benefitAmount > 0 AND benefitAmount < rules.maxAllotments.minimumBenefit:
  benefitAmount = rules.maxAllotments.minimumBenefit  // 24
```

**Rule:** BEN-ALLOT-001

### Step 16: Final Eligibility Check

```
if benefitAmount <= 0:
  return { eligible: false, reason: "Calculated benefit is zero or negative" }

return { eligible: true, benefitAmount: benefitAmount }
```

### Step 17: Initial Month Proration (if applicable)

```
if isInitialMonth:
  daysInMonth = daysInMonth(applicationDate)
  daysRemaining = daysInMonth + 1 - dayOfMonth(applicationDate)
  proratedAmount = floor(benefitAmount * (daysRemaining / daysInMonth))

  if proratedAmount < rules.benefitFormula.minimumIssuance:  // 10
    proratedAmount = 0  // No benefits for initial month
```

---

## 3. Expedited Processing Check

Run independently from the main benefit calculation. Determines whether the case qualifies for 7-day processing.

```
expeditedEligible = false
expeditedReason = null

// Criterion 1: Low income + low resources
if grossIncome < 150 AND countableResources <= 100:
  expeditedEligible = true
  expeditedReason = "gross_income_lt_150_and_resources_lte_100"

// Criterion 2: Shelter exceeds income + resources
totalShelterWithSUA = totalShelterCosts  // from step 11
if totalShelterWithSUA > (grossIncome + countableResources):
  expeditedEligible = true
  expeditedReason = "shelter_exceeds_income_plus_resources"

// Criterion 3: Destitute migrant/seasonal farmworker
if isDestituteMigrantFarmworker AND countableResources <= 100:
  expeditedEligible = true
  expeditedReason = "destitute_migrant_farmworker"
```

**Rule:** SLA-EXPED-001

---

## 4. Deduction Breakdown Output

The oracle returns a detailed deduction breakdown for the audit trail and notice generation:

```typescript
interface DeductionBreakdown {
  standardDeduction: number;
  earnedIncomeDeduction: number;
  dependentCareDeduction: number;
  childSupportDeduction: number;
  medicalDeduction: number;
  excessShelterDeduction: number;
  totalDeductions: number;
  shelterCostDetail: {
    rent: number;
    mortgage: number;
    propertyTax: number;
    insurance: number;
    condoFees: number;
    suaTier: string;
    suaAmount: number;
    totalShelterCosts: number;
  };
}
```

---

## 5. Calculation Step Audit Trail

Every step in the algorithm produces a record:

```typescript
interface CalculationStep {
  stepNumber: number;
  description: string;
  ruleId: string;
  inputs: Record<string, number | string>;
  output: number | string | boolean;
  formula?: string;  // human-readable formula applied
}
```

Example:

```json
{
  "stepNumber": 6,
  "description": "Apply standard deduction",
  "ruleId": "DED-STD-001",
  "inputs": { "grossIncome": 2500, "householdSize": 3 },
  "output": 2295,
  "formula": "2500 - 205 = 2295"
}
```

---

## 6. Oracle Comparison for Scoring

When scoring an agent's determination against the oracle:

```typescript
interface OracleComparison {
  eligibilityMatch: boolean;        // agent and oracle agree on eligible/ineligible
  benefitMatch: boolean;            // agent's benefit amount matches oracle's
  benefitDelta: number;             // difference (agent - oracle), 0 if match
  deductionMatches: {               // per-deduction comparison
    deductionType: string;
    agentValue: number;
    oracleValue: number;
    matches: boolean;
  }[];
  missingDeductions: string[];      // deductions oracle applied but agent missed
  extraDeductions: string[];        // deductions agent applied but oracle didn't
  citationsCovered: boolean;        // agent cited all rules oracle used
  missingCitations: string[];       // ruleIds oracle used but agent didn't cite
}
```

### Scoring Rubric

| Metric | Weight | Pass Condition |
|--------|--------|---------------|
| Eligibility correctness | Critical | `eligibilityMatch == true` |
| Benefit exactness | High | `benefitDelta == 0` |
| Benefit tolerance | Medium | `abs(benefitDelta) <= 10` (close but not exact) |
| Deduction accuracy | Medium | All `deductionMatches[].matches == true` |
| Citation coverage | High | `citationsCovered == true` |
| No extra deductions | Low | `extraDeductions.length == 0` |

---

## 7. Implementation Notes

### Pure Function

The oracle is a pure function with no side effects. It reads from the policy pack and case data, and returns a result. It never modifies state, makes network calls, or accesses a database.

```
oracle(input: OracleInput, policyPack: PolicyPack) => OracleOutput
```

### Rounding

All intermediate calculations use full precision. Only the final benefit amount is rounded down (`floor`). This matches the federal specification in 7 CFR 273.10.

### Edge Cases

- **Household size 0:** Return error (invalid input).
- **All income excluded:** grossIncome = 0, passes all tests, gets maximum allotment.
- **Negative adjusted income:** Floor to 0 at each step where subtraction occurs. Net income cannot be negative.
- **Household size > 10:** Use the `additionalMember` increment for both FPL and allotment tables.
- **No shelter costs and no SUA:** Excess shelter deduction = 0.

### Testing Strategy

The oracle is the most critical piece to test. Each step should have isolated unit tests, and the full pipeline should be validated against the Illinois SNAP calculator (https://fscalc.dhs.illinois.gov/FSCalc/) with at least 20 diverse scenarios covering:

1. Single person, no income (maximum benefit)
2. Single person, earned income only
3. Family of 4, mixed income
4. Elderly/disabled household with medical deductions
5. Household at exact income boundary (pass/fail at threshold)
6. Household with high shelter costs (capped vs uncapped)
7. Expedited processing cases (all 3 criteria)
8. Initial month proration scenarios
9. Minimum benefit edge cases (1-2 person households)
10. Large household (8+ members)
