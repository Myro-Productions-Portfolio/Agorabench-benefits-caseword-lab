interface RunSummaryData {
  totalCases: number;
  byVariant: Record<string, number>;
  byOutcome: { approved: number; denied: number; abandoned: number };
  slaCompliance: { onTime: number; breached: number; breachRate: number };
  averageTimeToDecision: number;
  noticeCompleteness: number;
  citationCoverage: number;
  errors: { caseId: string; error: string }[];
  oracleMetrics?: {
    casesEvaluated: number;
    eligibilityMatchRate: number;
    benefitExactMatchRate: number;
    averageBenefitDelta: number;
    mismatchCount: number;
    mismatchesBySeverity: Record<string, number>;
  };
  appealMetrics?: {
    casesAppealed: number;
    favorableRate: number;
    unfavorableRate: number;
    remandRate: number;
    avgTimeToDecision: number;
  };
}

interface Props {
  summary: RunSummaryData;
}

export function RunSummaryCard({ summary }: Props) {
  const { byOutcome, slaCompliance, averageTimeToDecision, citationCoverage } = summary;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-6">
      <h3 className="text-sm font-medium text-gray-300 mb-3">
        Run Results{summary.appealMetrics ? ': Appeal Reversal' : ': Missing Docs'}
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
        <div>
          <div className="text-2xl font-bold text-white">{summary.totalCases}</div>
          <div className="text-xs text-gray-500">Total Cases</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-green-400">{byOutcome.approved}</div>
          <div className="text-xs text-gray-500">Approved</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-red-400">{byOutcome.denied}</div>
          <div className="text-xs text-gray-500">Denied</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-yellow-400">{byOutcome.abandoned}</div>
          <div className="text-xs text-gray-500">Abandoned</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <span className="text-gray-500">SLA Compliance:</span>{' '}
          <span className={slaCompliance.breachRate > 0.2 ? 'text-red-400' : 'text-green-400'}>
            {((1 - slaCompliance.breachRate) * 100).toFixed(0)}%
          </span>
          <span className="text-gray-600 text-xs ml-1">({slaCompliance.breached} breaches)</span>
        </div>
        <div>
          <span className="text-gray-500">Avg Decision:</span>{' '}
          <span className="text-white">{averageTimeToDecision.toFixed(1)} days</span>
        </div>
        <div>
          <span className="text-gray-500">Citation Coverage:</span>{' '}
          <span className="text-green-400">{(citationCoverage * 100).toFixed(0)}%</span>
        </div>
      </div>
      {summary.oracleMetrics && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <h4 className="text-xs font-medium text-gray-400 mb-2">Oracle Accuracy</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Eligibility Match:</span>{' '}
              <span className={summary.oracleMetrics.eligibilityMatchRate < 0.8 ? 'text-red-400' : 'text-green-400'}>
                {(summary.oracleMetrics.eligibilityMatchRate * 100).toFixed(0)}%
              </span>
            </div>
            <div>
              <span className="text-gray-500">Benefit Match:</span>{' '}
              <span className={summary.oracleMetrics.benefitExactMatchRate < 0.5 ? 'text-yellow-400' : 'text-green-400'}>
                {(summary.oracleMetrics.benefitExactMatchRate * 100).toFixed(0)}%
              </span>
            </div>
            <div>
              <span className="text-gray-500">Avg Benefit Delta:</span>{' '}
              <span className="text-white">${summary.oracleMetrics.averageBenefitDelta.toFixed(0)}</span>
            </div>
            <div>
              <span className="text-gray-500">Mismatches:</span>{' '}
              <span className="text-yellow-400">{summary.oracleMetrics.mismatchCount}</span>
              {Object.entries(summary.oracleMetrics.mismatchesBySeverity).map(([sev, cnt]) => (
                <span key={sev} className="text-gray-600 text-xs ml-1">
                  {sev}: {cnt}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      {summary.appealMetrics && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <h4 className="text-xs font-medium text-gray-400 mb-2">Appeal Outcomes</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Cases Appealed:</span>{' '}
              <span className="text-white">{summary.appealMetrics.casesAppealed}</span>
            </div>
            <div>
              <span className="text-gray-500">Favorable:</span>{' '}
              <span className="text-green-400">
                {(summary.appealMetrics.favorableRate * 100).toFixed(0)}%
              </span>
            </div>
            <div>
              <span className="text-gray-500">Unfavorable:</span>{' '}
              <span className="text-red-400">
                {(summary.appealMetrics.unfavorableRate * 100).toFixed(0)}%
              </span>
            </div>
            <div>
              <span className="text-gray-500">Remand:</span>{' '}
              <span className="text-yellow-400">
                {(summary.appealMetrics.remandRate * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      )}
      {summary.errors.length > 0 && (
        <div className="mt-3 text-xs text-red-400">{summary.errors.length} error(s) during run</div>
      )}
    </div>
  );
}
