interface RunSummaryData {
  totalCases: number;
  byVariant: Record<string, number>;
  byOutcome: { approved: number; denied: number; abandoned: number };
  slaCompliance: { onTime: number; breached: number; breachRate: number };
  averageTimeToDecision: number;
  noticeCompleteness: number;
  citationCoverage: number;
  errors: { caseId: string; error: string }[];
}

interface Props {
  summary: RunSummaryData;
}

export function RunSummaryCard({ summary }: Props) {
  const { byOutcome, slaCompliance, averageTimeToDecision, citationCoverage } = summary;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-6">
      <h3 className="text-sm font-medium text-gray-300 mb-3">Run Results: Missing Docs Scenario</h3>
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
      {summary.errors.length > 0 && (
        <div className="mt-3 text-xs text-red-400">{summary.errors.length} error(s) during run</div>
      )}
    </div>
  );
}
