# Indiana SNAP Parameters (FY2026)

Indiana is the secondary jurisdiction for future policy pack expansion. This document contains state-specific values needed for an Indiana policy pack. Indiana's SNAP program is administered by the Family and Social Services Administration (FSSA), Division of Family Resources (DFR).

**Sources:**
- IN FSSA DFR SNAP Program: https://www.in.gov/fssa/dfr/snap-food-assistance/
- IN FSSA DFR Income Page: https://www.in.gov/fssa/dfr/snap-food-assistance/income/
- IN SNAP/TANF Policy Manual (full): https://www.in.gov/fssa/dfr/files/ICES_Program_Policy_Manual.pdf
- IN Policy Manual Ch. 3400 (Budgeting/Deductions): https://www.in.gov/fssa/dfr/files/3400.pdf
- USDA FNS BBCE State Table: https://www.fns.usda.gov/snap/broad-based-categorical-eligibility
- USDA FNS SNAP COLA FY2026: https://www.fns.usda.gov/snap/allotment/cola/fy26

---

## 1. Broad-Based Categorical Eligibility (BBCE)

Indiana uses BBCE through a TANF-funded brochure program, but it is **minimal compared to Illinois**:

| Parameter | Indiana | Illinois (comparison) |
|-----------|---------|----------------------|
| Gross income limit | **130% FPL** (standard federal) | 165% / 200% FPL |
| Asset limit | **$5,000** | Eliminated under BBCE |
| Qualifying Member distinction | **No** | Yes (elderly 60+ or disabled) |
| Elderly/disabled gross test exemption | Yes (federal rule) | Yes |

Indiana's BBCE does NOT raise the gross income limit above the standard 130% FPL. Its primary effect is setting the asset limit at $5,000 rather than the federal default of $2,750/$4,250.

**All households must still pass the 100% FPL net income test.**

### Legislative Watch: Indiana SB0001 (2026)

Senate Bill 1 of the 2026 Regular Session proposes to **terminate Indiana's BBCE participation**. As of February 20, 2026, the bill passed the Senate and received a House committee "do pass" recommendation (February 17, 2026) but is not yet signed into law. If enacted, asset limits would revert to the federal defaults ($2,750 standard / $4,250 elderly or disabled). Estimated impact: reduction of ~3,112 SNAP cases.

---

## 2. Income Limits by Household Size (FY2026)

Indiana uses the standard federal 130% FPL gross income limit (no BBCE elevation). Elderly/disabled households are exempt from the gross income test but must pass the net income test.

| HH Size | 130% FPL (gross) | 100% FPL (net) |
|---------|-------------------|----------------|
| 1 | $1,696 | $1,305 |
| 2 | $2,292 | $1,763 |
| 3 | $2,888 | $2,221 |
| 4 | $3,483 | $2,680 |
| 5 | $4,079 | $3,138 |
| 6 | $4,675 | $3,596 |
| 7 | $5,271 | $4,055 |
| 8 | $5,867 | $4,513 |
| 9 | $6,463 | $4,972 |
| 10 | $7,059 | $5,431 |
| Each add'l | +$596 | +$459 |

---

## 3. Maximum Monthly Allotments (FY2026, 48 States + DC)

Same federal table as Illinois -- these are uniform across the 48 contiguous states + DC.

| HH Size | Max Allotment |
|---------|--------------|
| 1 | $298 |
| 2 | $546 |
| 3 | $785 |
| 4 | $994 |
| 5 | $1,183 |
| 6 | $1,421 |
| 7 | $1,571 |
| 8 | $1,789 |
| 9 | $2,007 |
| 10 | $2,225 |
| Each add'l | +$218 |

**Minimum benefit** (1-2 person households): **$24**

---

## 4. Standard Deduction

Indiana follows the federal standard deduction schedule for the 48 contiguous states + DC:

| HH Size | Standard Deduction |
|---------|-------------------|
| 1-3 | $209 |
| 4 | $223 |
| 5 | $261 |
| 6+ | $299 |

Note: These differ slightly from Illinois ($205/$219/$257/$295). The federal schedule is updated annually; both states follow the same federal table but amounts can differ by a few dollars based on COLA timing.

---

## 5. Standard Utility Allowances (Indiana FY2026)

Indiana uses a four-tier SUA system. Values effective October 1, 2025, reflecting the November 2024 USDA final rule that standardized SUA methodology using CPI-U (2.7% increase).

| SUA Tier | Monthly Amount | Eligibility |
|----------|---------------|-------------|
| Heating/Cooling | $486 | Household pays heating or cooling costs |
| Basic (Non-Heating/Cooling) | $283 | Household pays 2+ non-heating/cooling utilities |
| Single Utility | $62 | Household pays exactly 1 non-heating/cooling utility |
| Telephone Only | $36 | Household pays only telephone/internet |

**Heat-and-eat rule (effective FY2026, per July 2025 federal law):**
- Households without a member age 60+ or disabled receiving LIHEAP no longer automatically qualify for the Heating/Cooling SUA
- Households with an elderly (60+) or disabled member receiving LIHEAP of $21+ still qualify

**Verification note:** SUA values sourced from SnapScreener (explicitly labeled Oct 1, 2025 - Sep 30, 2026). Should be cross-verified against IN Policy Manual Ch. 3400 before use in production calculations.

---

## 6. Other Indiana-Specific Parameters

| Parameter | Value | Indiana-Specific? |
|-----------|-------|-------------------|
| Earned income deduction | 20% (federal standard) | No |
| Medical deduction threshold | $35/month (federal standard) | No |
| Medical standard deduction | $155/month (federal value, available as alternative to itemized) | No |
| Excess shelter deduction cap | $744 (waived for elderly/disabled) | No |
| Homeless shelter deduction | $198.99/month | No |
| Child support | Treated as **deduction** (not income exclusion) | State chose deduction |
| Resource limit (BBCE) | $5,000 | Yes |
| Resource limit (non-BBCE elderly/disabled) | $4,500 | Federal default |

---

## 7. Processing Timelines (Indiana)

Indiana follows federal timelines:

| Action | Deadline |
|--------|----------|
| Standard application processing | 30 calendar days |
| Expedited processing | 7 calendar days |
| Verification request response | Minimum 10 days |
| Advance notice of adverse action | 10 days |
| Fair hearing request | 90 days from action |
| Fair hearing decision | 60 days from request |

---

## 8. Key Differences from Illinois

These differences drive the policy pack divergence and exercise different code paths in the oracle:

| Parameter | Illinois | Indiana |
|-----------|---------|---------|
| BBCE gross limit (no QM) | 165% FPL | 130% FPL |
| BBCE gross limit (with QM) | 200% FPL | 130% FPL (no QM distinction) |
| Asset limit | Eliminated | $5,000 |
| Standard deduction (HH 1-3) | $205 | $209 |
| Standard deduction (HH 4) | $219 | $223 |
| Standard deduction (HH 5) | $257 | $261 |
| Standard deduction (HH 6+) | $295 | $299 |
| SUA Heating/Cooling | $546 | $486 |
| SUA Limited/Basic | $457 | $283 |
| SUA Single Utility | $78 | $62 |
| SUA Telephone Only | $67 | $36 |
| Medical std deduction (group home) | $485 | N/A (uses federal $155) |
| Medical std deduction (community) | $185 | N/A (uses federal $155) |
| Homeless shelter deduction | $199 | $198.99 |
| Online SNAP calculator | Yes (fscalc.dhs.illinois.gov) | No official calculator |
| Policy manual format | HTML (parseable) | PDF (harder to parse) |

### Oracle Implications

The Indiana policy pack exercises fewer code paths than Illinois because:
1. No Qualifying Member logic for gross income (single threshold instead of dual)
2. No elevated FPL percentages (standard 130% only)
3. No state-specific medical standard deductions (uses federal $155)
4. Lower SUA amounts across all tiers

This makes Indiana a simpler test case and a good baseline for verifying the oracle handles the standard federal rules correctly before testing Illinois's more complex BBCE variations.

---

## 9. Validation

Indiana does **not** provide an official SNAP eligibility calculator. Validation options:

- **SnapScreener:** https://www.snapscreener.com/screener/indiana (unofficial, well-maintained, current as of Oct 2025)
- **FSSA Benefits Portal:** https://fssabenefits.in.gov/bp/#/eligibility/eligibility-snap (estimates only)
- **Manual calculation** against the federal benefit formula using Indiana-specific values from this document
