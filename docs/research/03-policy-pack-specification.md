# Policy Pack Specification

A **policy pack** is a versioned artifact bundle that encodes all jurisdiction-specific rules, timelines, templates, and source citations for a single program in a single jurisdiction. The oracle and scoring engine operate exclusively against policy packs -- they never hardcode rules.

---

## 1. Policy Pack Structure

```
policy-packs/
  snap-illinois-fy2026-v1/
    pack.json           # Metadata (program, jurisdiction, version, effective dates)
    rules.json          # Machine-readable eligibility and benefit rules
    sla.json            # Processing timelines and deadlines
    citations.json      # Pinned regulatory sources with snapshot hashes
    templates/
      verification-request.md
      approval-notice.md
      denial-notice.md
      adverse-action-notice.md
      appeal-rights.md
```

---

## 2. pack.json

```json
{
  "packId": "snap-illinois-fy2026-v1",
  "program": "SNAP",
  "jurisdiction": "IL",
  "version": "1",
  "effectiveDate": "2025-10-01",
  "expirationDate": "2026-09-30",
  "federalBasis": "7 CFR Part 273",
  "stateManualUrl": "https://www.dhs.state.il.us/page.aspx?item=4107",
  "createdAt": "2026-02-20T00:00:00Z"
}
```

---

## 3. rules.json

Each rule has a stable `ruleId` that agents must cite when making decisions. Rules are organized by category.

```json
{
  "incomeTests": {
    "grossIncomeTest": {
      "ruleId": "ELIG-GROSS-001",
      "description": "Gross income must not exceed threshold for household size",
      "appliesTo": "non-elderly-non-disabled",
      "thresholdPctFpl": 165,
      "thresholdPctFplWithQM": 200,
      "exemptIfCategoricallyEligible": true,
      "citation": "7 CFR 273.9; IL BBCE Policy"
    },
    "netIncomeTest": {
      "ruleId": "ELIG-NET-001",
      "description": "Net income must not exceed 100% FPL for household size",
      "appliesTo": "all",
      "thresholdPctFpl": 100,
      "citation": "7 CFR 273.9"
    }
  },
  "resourceLimits": {
    "standard": {
      "ruleId": "ELIG-RES-001",
      "limit": 3000,
      "appliesTo": "non-qm",
      "citation": "7 CFR 273.8; IL BBCE"
    },
    "withQualifyingMember": {
      "ruleId": "ELIG-RES-002",
      "limit": 4500,
      "appliesTo": "with-qm",
      "citation": "7 CFR 273.8; IL BBCE"
    }
  },
  "fplTable": {
    "ruleId": "ELIG-FPL-001",
    "fiscalYear": "FY2026",
    "citation": "HHS Poverty Guidelines 2025",
    "monthlyByHouseholdSize": {
      "1": 1305, "2": 1763, "3": 2221, "4": 2680,
      "5": 3138, "6": 3596, "7": 4055, "8": 4513
    },
    "additionalMember": 459
  },
  "maxAllotments": {
    "ruleId": "BEN-ALLOT-001",
    "fiscalYear": "FY2026",
    "citation": "FNS Thrifty Food Plan FY2026",
    "monthlyByHouseholdSize": {
      "1": 298, "2": 546, "3": 785, "4": 994,
      "5": 1183, "6": 1421, "7": 1571, "8": 1789,
      "9": 2007, "10": 2225
    },
    "additionalMember": 218,
    "minimumBenefit": 24,
    "minimumBenefitAppliesTo": [1, 2]
  },
  "deductions": {
    "standard": {
      "ruleId": "DED-STD-001",
      "citation": "7 CFR 273.9(d)(1); IL WAG 25-03-02",
      "byHouseholdSize": {
        "1": 205, "2": 205, "3": 205, "4": 219, "5": 257, "6": 295
      },
      "sixPlusAppliesTo": "6+"
    },
    "earnedIncome": {
      "ruleId": "DED-EARN-001",
      "rate": 0.20,
      "citation": "7 CFR 273.9(d)(2)"
    },
    "medical": {
      "ruleId": "DED-MED-001",
      "threshold": 35,
      "appliesTo": "elderly-or-disabled-only",
      "standardGroupHome": 485,
      "standardCommunity": 185,
      "citation": "7 CFR 273.9(d)(3); IL Policy"
    },
    "dependentCare": {
      "ruleId": "DED-DEP-001",
      "citation": "7 CFR 273.9(d)(4)"
    },
    "childSupport": {
      "ruleId": "DED-CS-001",
      "type": "deduction",
      "citation": "7 CFR 273.9(d)(5); IL state option"
    },
    "excessShelter": {
      "ruleId": "DED-SHLT-001",
      "incomeMultiplier": 0.50,
      "cap": 744,
      "capWaivedFor": "elderly-or-disabled",
      "citation": "7 CFR 273.9(d)(6)"
    },
    "homelessShelter": {
      "ruleId": "DED-HMLS-001",
      "standardAmount": 199,
      "citation": "7 CFR 273.9(d)(6); IL policy"
    }
  },
  "utilityAllowances": {
    "ruleId": "SUA-001",
    "citation": "IL WAG 25-03-02",
    "tiers": {
      "heatingCooling": 546,
      "limitedUtility": 457,
      "singleUtility": 78,
      "telephoneOnly": 67
    }
  },
  "benefitFormula": {
    "ruleId": "BEN-CALC-001",
    "contributionRate": 0.30,
    "formula": "max_allotment - (0.30 * net_income)",
    "roundDirection": "down",
    "minimumIssuance": 10,
    "citation": "7 CFR 273.10"
  },
  "incomeConversion": {
    "ruleId": "INC-CONV-001",
    "weeklyMultiplier": 4.3,
    "biweeklyMultiplier": 2.15,
    "citation": "7 CFR 273.10(c)"
  },
  "verification": {
    "mandatory": {
      "ruleId": "VER-MAND-001",
      "items": ["identity", "ssn", "gross_nonexempt_income", "immigration_status", "residency"],
      "citation": "7 CFR 273.2(f)(1)"
    },
    "conditional": {
      "ruleId": "VER-COND-001",
      "items": ["disability", "student_status", "deductible_expenses", "household_composition", "resources"],
      "citation": "7 CFR 273.2(f)(4)"
    },
    "responseDeadlineMinDays": 10,
    "failureVsRefusalDistinction": true
  },
  "noticeRequirements": {
    "approval": {
      "ruleId": "NOT-APPR-001",
      "requiredFields": [
        "benefit_amount", "certification_period", "calculation_basis",
        "fair_hearing_rights", "office_phone", "contact_person",
        "legal_representation", "reporting_obligations", "reapply_notice"
      ],
      "citation": "7 CFR 273.10"
    },
    "denial": {
      "ruleId": "NOT-DENY-001",
      "requiredFields": [
        "action_taken", "specific_reason", "fair_hearing_rights",
        "office_phone", "contact_person", "legal_representation"
      ],
      "citation": "7 CFR 273.10"
    },
    "adverseAction": {
      "ruleId": "NOT-ADV-001",
      "requiredFields": [
        "proposed_action", "reason", "fair_hearing_rights",
        "office_phone", "contact_person", "continued_benefits_notice",
        "overpayment_liability", "legal_representation"
      ],
      "advanceNoticeDays": 10,
      "citation": "7 CFR 273.13(a)"
    },
    "verificationRequest": {
      "ruleId": "NOT-VER-001",
      "requiredFields": [
        "specific_missing_verification", "deadline", "consequences",
        "agency_assistance_obligation", "failure_vs_refusal_explanation"
      ],
      "citation": "7 CFR 273.2(f),(h)"
    }
  }
}
```

---

## 4. sla.json

```json
{
  "processing": {
    "standard": {
      "slaId": "SLA-PROC-001",
      "maxCalendarDays": 30,
      "startEvent": "APPLICATION_FILED",
      "endEvent": "DETERMINATION_MADE",
      "citation": "7 CFR 273.2"
    },
    "expedited": {
      "slaId": "SLA-EXPED-001",
      "maxCalendarDays": 7,
      "startEvent": "APPLICATION_FILED",
      "endEvent": "BENEFITS_AVAILABLE",
      "criteria": [
        "gross_income_lt_150_and_resources_lte_100",
        "shelter_exceeds_income_plus_resources",
        "destitute_migrant_farmworker"
      ],
      "verificationRequiredBeforeIssuance": ["identity"],
      "citation": "7 CFR 273.2(i)"
    }
  },
  "verification": {
    "responseDeadline": {
      "slaId": "SLA-VER-001",
      "minCalendarDays": 10,
      "startEvent": "VERIFICATION_REQUESTED",
      "endEvent": "VERIFICATION_RECEIVED",
      "citation": "7 CFR 273.2(f)"
    },
    "postDenialRecovery30": {
      "slaId": "SLA-VER-002",
      "maxCalendarDays": 30,
      "effect": "benefits_from_application_date",
      "citation": "7 CFR 273.2"
    },
    "postDenialRecovery60": {
      "slaId": "SLA-VER-003",
      "minCalendarDays": 31,
      "maxCalendarDays": 60,
      "effect": "benefits_from_verification_date",
      "citation": "7 CFR 273.2"
    }
  },
  "notices": {
    "adverseActionAdvance": {
      "slaId": "SLA-NOT-001",
      "minCalendarDays": 10,
      "citation": "7 CFR 273.13"
    }
  },
  "appeals": {
    "requestDeadline": {
      "slaId": "SLA-APP-001",
      "maxCalendarDays": 90,
      "startEvent": "ADVERSE_ACTION_DATE",
      "endEvent": "APPEAL_REQUESTED",
      "citation": "7 CFR 273.15"
    },
    "hearingNotice": {
      "slaId": "SLA-APP-002",
      "minCalendarDays": 10,
      "beforeEvent": "HEARING_DATE",
      "citation": "7 CFR 273.15"
    },
    "stateDecision": {
      "slaId": "SLA-APP-003",
      "maxCalendarDays": 60,
      "startEvent": "APPEAL_REQUESTED",
      "endEvent": "APPEAL_DECIDED",
      "citation": "7 CFR 273.15"
    },
    "benefitImplementation": {
      "slaId": "SLA-APP-004",
      "maxCalendarDays": 10,
      "condition": "decision_increases_benefits",
      "citation": "7 CFR 273.15"
    }
  },
  "recertification": {
    "noticeOfExpiration": {
      "slaId": "SLA-RECERT-001",
      "before": "first_day_of_last_month_of_certification",
      "citation": "7 CFR 273.14"
    },
    "applicationDeadline": {
      "slaId": "SLA-RECERT-002",
      "by": "15th_of_last_month_of_certification",
      "citation": "7 CFR 273.14"
    }
  }
}
```

---

## 5. citations.json

```json
{
  "sources": [
    {
      "citationId": "CFR-273",
      "title": "7 CFR Part 273 - Certification of Eligible Households",
      "url": "https://www.ecfr.gov/current/title-7/subtitle-B/chapter-II/subchapter-C/part-273",
      "accessDate": "2026-02-20",
      "type": "federal_regulation"
    },
    {
      "citationId": "CFR-273-10",
      "title": "7 CFR 273.10 - Determining household eligibility and benefit levels",
      "url": "https://www.ecfr.gov/current/title-7/subtitle-B/chapter-II/subchapter-C/part-273/subpart-D/section-273.10",
      "accessDate": "2026-02-20",
      "type": "federal_regulation"
    },
    {
      "citationId": "CFR-273-15",
      "title": "7 CFR 273.15 - Fair hearings",
      "url": "https://www.law.cornell.edu/cfr/text/7/273.15",
      "accessDate": "2026-02-20",
      "type": "federal_regulation"
    },
    {
      "citationId": "IL-DHS-MANUAL",
      "title": "Illinois DHS Cash, SNAP, and Medical Manual",
      "url": "https://www.dhs.state.il.us/page.aspx?item=4107",
      "accessDate": "2026-02-20",
      "type": "state_manual"
    },
    {
      "citationId": "IL-WAG-25-03-02",
      "title": "Illinois WAG 25-03-02 Standards Desk Aid",
      "url": "https://www.dhs.state.il.us/page.aspx?item=21738",
      "accessDate": "2026-02-20",
      "type": "state_desk_aid"
    },
    {
      "citationId": "FNS-FY2026-COLA",
      "title": "SNAP FY 2026 Cost-of-Living Adjustments",
      "url": "https://www.fns.usda.gov/snap/allotment/cola/fy26",
      "accessDate": "2026-02-20",
      "type": "federal_guidance"
    }
  ]
}
```

---

## 6. Notice Templates

Templates use placeholders (e.g., `{{benefit_amount}}`) that the system fills with case-specific data. Each template must include all required fields per the notice requirements rules.

Example `templates/denial-notice.md`:

```markdown
# Notice of Denial

**Date:** {{notice_date}}
**Case Number:** {{case_id}}
**Applicant:** {{applicant_name}}

---

Your application for SNAP benefits has been **denied**.

**Reason for denial:** {{denial_reason}}

**Regulatory basis:** {{cited_rule_ids}}

---

## Your Rights

You have the right to request a **fair hearing** within **90 days** of this notice.

To request a hearing, contact:
- **Phone:** {{office_phone}}
- **Contact:** {{contact_person}}

Free legal representation may be available. Contact {{legal_aid_info}}.
```

---

## 7. Versioning

Policy packs are immutable once published. To update rules (e.g., FY2027 COLA), create a new version:

```
snap-illinois-fy2026-v1  (effective 2025-10-01)
snap-illinois-fy2027-v1  (effective 2026-10-01)
```

Benchmark runs record the exact `packId` used. Scoring and training data always reference a specific pack version.
