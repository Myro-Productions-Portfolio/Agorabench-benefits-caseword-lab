# SNAP Federal Rules Reference (7 CFR Part 273)

This document contains the concrete federal SNAP rules needed to build the deterministic oracle and policy pack system. All data sourced from 7 CFR Part 273.

---

## 1. Eligibility Tests

### Gross Income Test (7 CFR 273.9)

- Household gross income must not exceed **130% of FPL** for household size
- Applies to all households EXCEPT those with an elderly (60+) or disabled member
- Elderly/disabled households are **exempt** from the gross income test

### Net Income Test (7 CFR 273.9)

- Household net income (after deductions) must not exceed **100% of FPL** for household size
- Applies to **all** households, including elderly/disabled
- Non-elderly/non-disabled households must pass BOTH tests

### Resource Limits (7 CFR 273.8)

- **$2,000** for households without elderly/disabled members
- **$3,000** for households with at least one elderly/disabled member
- Categorically eligible households (BBCE) are exempt from resource limits in most states

### Categorical Eligibility (7 CFR 273.2(j))

- Households receiving TANF, SSI, or certain other public assistance may be categorically eligible
- Exempt from income tests and resource limits (state-dependent via BBCE)
- States set their own BBCE thresholds (130%-200% FPL)

---

## 2. Income and Deductions (7 CFR 273.9)

### Income Types

**Earned income:** Wages, salaries, self-employment income (net of allowable business costs), tips, commissions

**Unearned income:** Social Security, SSI, pensions, unemployment, child support received, rental income, annuities, worker's comp, VA benefits, TANF

**Excluded income:** EITC (12 months), energy assistance (LIHEAP), educational loans/grants, reimbursements, in-kind income, combat pay

### Income Conversion

- Weekly income x **4.3** = monthly
- Biweekly income x **2.15** = monthly

### Deductions (Applied in This Order)

**1. Standard Deduction**
- Varies by household size and state
- Federal base: 8.31% of monthly net income eligibility standard
- Adjusted annually

**2. Earned Income Deduction**
- **20%** of gross earned income
- Flat rate, no cap

**3. Medical Deduction (Elderly/Disabled Only)**
- Only for household members who are 60+ or disabled
- Deductible amount = medical expenses exceeding **$35/month**
- Covers: doctor/dental, hospital, prescriptions, medical equipment, insurance premiums (including Medicare), dentures, hearing aids, prosthetics, eyeglasses, medical transportation, attendant care

**4. Dependent Care Deduction**
- Costs necessary for employment, training, education
- Covers child care (under 18) and incapacitated adult care
- No federal cap

**5. Child Support Deduction**
- Legally obligated payments to non-household members
- State option: can be income exclusion OR deduction (not both)

**6. Excess Shelter Deduction**
- Monthly shelter costs exceeding **50%** of adjusted income (after all above deductions)
- **Capped** unless household contains elderly/disabled member (then uncapped)
- Shelter costs include: rent, mortgage, condo fees, property taxes, structure insurance, utilities (via SUA), well/septic maintenance

---

## 3. Benefit Calculation Formula (7 CFR 273.10)

```
Step 1:  Gross Income = Earned + Unearned
Step 2:  Subtract Standard Deduction
Step 3:  Subtract 20% Earned Income Deduction (0.20 * Earned Income)
Step 4:  Subtract Dependent Care Deduction
Step 5:  Subtract Child Support Deduction
Step 6:  Subtract Medical Deduction (elderly/disabled only, excess over $35)
Step 7:  = Adjusted Net Income
Step 8:  Excess Shelter = max(0, Shelter Costs - (0.50 * Adjusted Net Income))
Step 9:  Apply shelter cap (unless elderly/disabled in household)
Step 10: Net Income = Adjusted Net Income - Excess Shelter Deduction
Step 11: Expected Contribution = 0.30 * Net Income
Step 12: Benefit = Max_Allotment[household_size] - Expected Contribution
Step 13: Round DOWN to nearest whole dollar
Step 14: If 1-2 person household and benefit < minimum benefit, set to minimum benefit
Step 15: If benefit <= 0, household is ineligible
```

### Minimum Benefit

- 1- and 2-person households receive minimum allotment = **8% of max allotment for household of 1**
- Does NOT apply in the initial month of application

### Initial Month Proration

```
Prorated Benefit = floor(Full_Month_Benefit * (Days_Remaining_in_Month / Days_in_Month))
```

Where Days_Remaining = Days_in_Month + 1 - Application_Date

- If prorated amount < **$10**, no benefits issued for initial month

---

## 4. Processing Timelines (7 CFR 273.2)

### Standard Processing

- **30 calendar days** from application filing date to eligibility determination
- Clock starts the day the application is filed

### Expedited Processing (7 CFR 273.2(i))

Qualifies if ANY ONE of these is true:

1. Gross monthly income < **$150** AND liquid resources <= **$100**
2. Monthly housing costs (rent/mortgage + SUA) > gross monthly income + liquid resources
3. Destitute migrant/seasonal farmworker with liquid resources <= **$100**

**Expedited deadline:** Benefits available no later than **7th calendar day** after filing date.

**Verification for expedited:** Only **identity** must be verified before issuance. All other verification postponed up to approximately 60 days (end of second month following application month).

### Agency-Caused Delays

When state misses 30-day deadline due to agency fault:
- Must provide **full month's allotment** (no proration penalty)
- Must issue back benefits as soon as possible
- Lost benefits must be restored

---

## 5. Verification Requirements (7 CFR 273.2(f))

### Mandatory (Must Verify Before Certification)

| Item | Acceptable Documents |
|------|---------------------|
| Identity | Driver's license, work/school ID, birth certificate, SSN card, voter card. ONE document. |
| SSN | Verified through IEVS interface with SSA |
| Gross non-exempt income | Pay stubs, W-2, employer verification, tax forms, benefit statements |
| Immigration status | I-94, I-151, Passport, G-641; validated through SAVE |
| Residency | Rent receipts, utility bills, mortgage |

### Conditional (Verify When Claimed or Questionable)

| Item | When Required |
|------|--------------|
| Disability | When claimed |
| Student status | When claimed as exemption basis |
| Deductible expenses | Medical, shelter, dependent care, child support -- verify when claimed |
| Household composition | When questionable or inconsistent |
| Resources | When questionable (not mandatory at initial application in all states) |

### Missing Verification Procedures

1. Household given **minimum 10 days** to provide verification
2. Written notice must specify EXACTLY what is missing
3. State must assist household in obtaining verification

**At day 30:**
- If household was NOT given 10 days: application PENDED (not denied)
- If household WAS given 10 days and failed: may be DENIED
- Must issue second notice before denial

**Failure vs. refusal distinction (critical):**
- **Failure** (tried but couldn't get docs): pend, do not deny
- **Refusal** (explicitly refuses): deny at time of refusal
- If ANY question: do NOT deny

**Post-denial recovery:**
- Verification arrives within 30 days of filing: benefits from application date
- Days 31-60: reopen, benefits from date verification furnished
- After 60 days: new application required

---

## 6. Notice Requirements (7 CFR 273.10, 273.13)

### Approval Notice Must Include

- Benefit amount (monthly allotment)
- Certification period (start and end dates)
- Basis for calculation (income, deductions, household size)
- Right to request fair hearing
- SNAP office phone number
- Contact person name
- Availability of free legal representation
- Obligation to report changes
- Need to reapply at end of certification period

### Denial Notice Must Include

- Action taken (denial)
- Specific reason for denial
- Right to request fair hearing within 90 days
- SNAP office phone number
- Contact person name
- Availability of free legal representation

### Adverse Action (Reduction/Termination) Notice Must Include

- Proposed action
- Reason for proposed action
- Right to request fair hearing
- SNAP office phone number
- Contact person name
- Availability of continued benefits during appeal
- Liability for overpayments if hearing unfavorable
- Availability of free legal representation

### Timely Notice Requirement

- Minimum **10 days** from mail date to action effective date
- Both timely (procedural) and adequate (content) must be satisfied

### Verification Request Notice Must Include

- Specific verification that is missing
- Deadline for providing (minimum 10 days)
- Consequences of failure (denial or pending)
- State's obligation to assist
- Difference between failure and refusal to cooperate

---

## 7. Appeals / Fair Hearings (7 CFR 273.15)

### Trigger

Household may request hearing on **any action** affecting their SNAP participation, including disputes about current benefit level.

### Timelines

| Action | Deadline |
|--------|----------|
| Request hearing | **90 days** from adverse action date |
| Advance written notice of hearing | **10 days** before hearing |
| State-level decision | **60 days** from receipt of request |
| Local-level decision | **45 days** from receipt of request |
| Appeal of local decision | **45 days** from receipt of appeal |

### Continued Benefits During Appeal

Benefits continue at pre-adverse-action level IF:
- Hearing requested **within the advance notice period** (before action takes effect)
- Certification period has not expired
- Household has not waived continuation

If agency action upheld: overpayment claim established.

### Decision Requirements

- Must comply with federal law
- Based on hearing record
- Summarize facts
- Specify reasons with supporting evidence
- Cite pertinent regulations

### Benefit Implementation After Decision

- Decisions increasing benefits: reflected within **10 days**
- Decisions decreasing benefits: next scheduled issuance
- Lost benefits: restored "as soon as administratively feasible"

---

## Key CFR Section Index

| Topic | Section |
|-------|---------|
| Household composition | 7 CFR 273.1 |
| Application processing, verification, expedited | 7 CFR 273.2 |
| Citizenship and alien status | 7 CFR 273.4 |
| SSN requirements | 7 CFR 273.6 |
| Work provisions / ABAWD | 7 CFR 273.7 |
| Resource eligibility | 7 CFR 273.8 |
| Income and deductions | 7 CFR 273.9 |
| Eligibility determination and benefit calculation | 7 CFR 273.10 |
| Reporting requirements | 7 CFR 273.12 |
| Notice of adverse action | 7 CFR 273.13 |
| Recertification | 7 CFR 273.14 |
| Fair hearings | 7 CFR 273.15 |
