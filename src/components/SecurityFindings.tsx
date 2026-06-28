import { useMemo, useState } from 'react';
import findingsData from '../data/securityFindings.json';
import { Copy, Check, Shield, ShieldAlert, ShieldCheck, ChevronDown, ChevronRight } from 'lucide-react';

interface Finding {
  internal_id: string;
  scanner_name: string;
  title: string;
  severity: string;
  status: string;
  owner: string;
  justification: string;
}

const severityColor: Record<string, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-blue-500 text-white',
};

const statusIcon = (s: string) => {
  if (s === 'fixed') return <ShieldCheck className="w-4 h-4 text-green-600" />;
  if (s === 'open') return <ShieldAlert className="w-4 h-4 text-red-600" />;
  return <Shield className="w-4 h-4 text-gray-500" />;
};

export default function SecurityFindings() {
  const findings = findingsData.findings as Finding[];
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return findings.filter((f) => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false;
      if (!q) return true;
      return (
        f.internal_id.toLowerCase().includes(q) ||
        f.title.toLowerCase().includes(q) ||
        f.scanner_name.toLowerCase().includes(q) ||
        f.severity.toLowerCase().includes(q)
      );
    });
  }, [findings, query, statusFilter]);

  const copy = async (f: Finding) => {
    const text = `[${f.internal_id}] ${f.title}\nScanner: ${f.scanner_name} • Severity: ${f.severity} • Status: ${f.status}\nOwner: ${f.owner}\nJustification: ${f.justification}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(f.internal_id);
      setTimeout(() => setCopiedId((c) => (c === f.internal_id ? null : c)), 1500);
    } catch {
      /* ignore */
    }
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { total, fixed, ignored } = findingsData.summary;

  const btn = (active: boolean) =>
    `px-3 py-1.5 rounded-md text-sm border transition-colors ${
      active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
    }`;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6" /> Security Findings
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Generated {findingsData.generatedAt}. Source: <code>src/data/securityFindings.json</code>. See{' '}
          <code>SECURITY_AUDIT.md</code> and <code>AUTH_MIGRATION_PLAN.md</code> for context.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500">Total</div>
          <div className="text-2xl font-bold">{total}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500">Fixed</div>
          <div className="text-2xl font-bold text-green-600">{fixed}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500">Ignored</div>
          <div className="text-2xl font-bold text-orange-600">{ignored}</div>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-2 md:items-center">
          <input
            type="text"
            placeholder="Filter by internal_id, title, scanner, or severity…"
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            className="w-full md:max-w-md px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2 flex-wrap">
            {['all', 'ignored', 'fixed', 'open'].map((s) => (
              <button key={s} className={btn(statusFilter === s) + ' capitalize'} onClick={() => setStatusFilter(s)}>
                {s}
              </button>
            ))}
          </div>
          <div className="md:ml-auto text-sm text-gray-500">
            {filtered.length} of {findings.length}
          </div>
        </div>

        <div className="divide-y border rounded-md">
          {filtered.map((f) => {
            const isOpen = expanded.has(f.internal_id);
            return (
              <div key={f.internal_id} className="p-3">
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => toggle(f.internal_id)}
                    className="mt-1 text-gray-500 hover:text-gray-900"
                    aria-label={isOpen ? 'Collapse' : 'Expand'}
                  >
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {statusIcon(f.status)}
                      <code className="text-xs font-mono break-all">{f.internal_id}</code>
                      <span className={`text-xs px-2 py-0.5 rounded ${severityColor[f.severity] || 'bg-gray-400 text-white'}`}>
                        {f.severity}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded border border-gray-300 capitalize">{f.status}</span>
                      <span className="text-xs text-gray-500">{f.scanner_name}</span>
                    </div>
                    <div className="text-sm mt-1">{f.title}</div>
                    {isOpen && (
                      <div className="mt-3 space-y-2">
                        <div>
                          <div className="text-xs font-semibold text-gray-500 uppercase">Owner</div>
                          <div className="text-sm">{f.owner}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-gray-500 uppercase">Justification</div>
                          <div className="text-sm whitespace-pre-wrap bg-gray-50 p-2 rounded border">
                            {f.justification}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => copy(f)}
                    title="Copy justification"
                    className="shrink-0 inline-flex items-center px-2 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    {copiedId === f.internal_id ? (
                      <>
                        <Check className="w-4 h-4 mr-1" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-1" /> Copy
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="p-8 text-center text-sm text-gray-500">No findings match.</div>}
        </div>
      </div>
    </div>
  );
}
