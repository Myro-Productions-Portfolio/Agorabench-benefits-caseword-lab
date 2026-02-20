import type { ArtifactRecord } from '@shared/types';

export function ArtifactViewer({ artifact }: { artifact: ArtifactRecord }) {
  const content = artifact.content as Record<string, unknown>;

  if (artifact.type === 'verification_request') {
    const items = content.missingItems as string[];
    return (
      <div className="mt-2 p-3 bg-gray-800 rounded border border-yellow-800/50">
        <div className="text-xs font-semibold text-yellow-400 mb-2">Verification Request</div>
        <div className="text-xs text-gray-300 space-y-1">
          <div><span className="text-gray-500">Missing:</span> {items.join(', ')}</div>
          <div><span className="text-gray-500">Deadline:</span> {content.deadline as string}</div>
          <div><span className="text-gray-500">Consequences:</span> {content.consequences as string}</div>
          <div><span className="text-gray-500">Agency obligation:</span> {content.assistanceObligation as string}</div>
        </div>
      </div>
    );
  }

  if (artifact.type === 'determination_worksheet') {
    const ded = content.deductions as Record<string, number>;
    return (
      <div className="mt-2 p-3 bg-gray-800 rounded border border-blue-800/50">
        <div className="text-xs font-semibold text-blue-400 mb-2">Determination Worksheet</div>
        <div className={`text-sm font-medium mb-2 ${content.eligible ? 'text-green-400' : 'text-red-400'}`}>
          {content.eligible ? 'ELIGIBLE' : 'DENIED'}
          {typeof content.reason === 'string' && <span className="text-gray-400 text-xs ml-2">-- {content.reason}</span>}
        </div>
        <table className="text-xs text-gray-300 w-full">
          <tbody>
            <tr><td className="text-gray-500 pr-4">Gross income</td><td>${content.grossIncome as number}</td></tr>
            <tr><td className="text-gray-500 pr-4">Standard ded.</td><td>-${ded.standard}</td></tr>
            <tr><td className="text-gray-500 pr-4">Earned income ded.</td><td>-${ded.earnedIncome}</td></tr>
            <tr><td className="text-gray-500 pr-4">Dependent care</td><td>-${ded.dependentCare}</td></tr>
            <tr><td className="text-gray-500 pr-4">Child support</td><td>-${ded.childSupport}</td></tr>
            <tr><td className="text-gray-500 pr-4">Medical</td><td>-${ded.medical}</td></tr>
            <tr><td className="text-gray-500 pr-4">Excess shelter</td><td>-${ded.excessShelter}</td></tr>
            <tr className="border-t border-gray-700"><td className="text-gray-500 pr-4 pt-1">Net income</td><td className="pt-1">${content.netIncome as number}</td></tr>
            <tr className="font-medium"><td className="text-gray-400 pr-4">Benefit amount</td><td className="text-green-400">${content.benefitAmount as number}/mo</td></tr>
          </tbody>
        </table>
      </div>
    );
  }

  if (artifact.type === 'notice') {
    const fields = content.fields as Record<string, string>;
    return (
      <div className="mt-2 p-3 bg-gray-800 rounded border border-purple-800/50">
        <div className="text-xs font-semibold text-purple-400 mb-2">
          Notice -- {(content.noticeType as string).toUpperCase()}
        </div>
        <div className="text-xs text-gray-300 space-y-1">
          <div><span className="text-gray-500">To:</span> {content.recipientName as string}</div>
          <div><span className="text-gray-500">Date:</span> {content.noticeDate as string}</div>
          <div><span className="text-gray-500">Template:</span> {content.templateId as string}</div>
          {Object.entries(fields).map(([k, v]) => (
            <div key={k}><span className="text-gray-500">{k}:</span> {v}</div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <pre className="mt-2 text-xs text-gray-500 font-mono overflow-x-auto bg-gray-800 p-2 rounded">
      {JSON.stringify(content, null, 2)}
    </pre>
  );
}
