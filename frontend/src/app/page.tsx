'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type CellValue = string | number | boolean | null;
type QueryRow = Record<string, CellValue>;

type Freshness = {
  status?: string;
  dataset?: string;
  updated_at?: string;
  message?: string;
};

type QueryResult = {
  status?: 'success' | 'error' | string;
  query_id?: string;
  answer?: string;
  explanation?: string;
  sql?: string;
  sql_generated?: string;
  metric_used?: string | null;
  assumptions?: string[];
  freshness?: Freshness | null;
  fallback_used?: boolean;
  fallback_type?: string | null;
  execution_time_ms?: number;
  bytes_processed?: number;
  rows_returned?: number;
  rows?: QueryRow[];
  results_summary?: string;
  estimated_cost_usd?: number;
  message?: string;
  intent?: string;
};

type HistoryItem = {
  id: string;
  question: string;
  status: string;
  createdAt: string;
};

type FeedbackState = 'helpful' | 'needs-work' | null;

const sampleQuestions = [
  'What was monthly revenue by product category?',
  'Which campaign had the highest ROI?',
  'Show delivery delay rate by customer state.',
];

const demoRows: QueryRow[] = [
  { segment: 'Electronics', revenue: 184200, orders: 831, refund_rate: 0.034 },
  { segment: 'Home', revenue: 137650, orders: 690, refund_rate: 0.027 },
  { segment: 'Beauty', revenue: 94220, orders: 544, refund_rate: 0.019 },
  { segment: 'Sports', revenue: 81710, orders: 402, refund_rate: 0.041 },
];

function toCellValue(value: unknown): CellValue {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
    return value as CellValue;
  }

  return JSON.stringify(value);
}

function normalizeRows(rows: unknown): QueryRow[] {
  if (!Array.isArray(rows)) return [];

  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
    .map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toCellValue(value)])),
    );
}

function normalizeResult(payload: unknown): QueryResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { status: 'error', message: 'The API returned an unsupported response.' };
  }

  const data = payload as Record<string, unknown>;
  const assumptions = Array.isArray(data.assumptions)
    ? data.assumptions.filter((item): item is string => typeof item === 'string')
    : [];

  const freshness =
    data.freshness && typeof data.freshness === 'object' && !Array.isArray(data.freshness)
      ? (data.freshness as Freshness)
      : null;

  return {
    status: typeof data.status === 'string' ? data.status : 'success',
    query_id: typeof data.query_id === 'string' ? data.query_id : undefined,
    answer: typeof data.answer === 'string' ? data.answer : undefined,
    explanation: typeof data.explanation === 'string' ? data.explanation : undefined,
    sql: typeof data.sql === 'string' ? data.sql : undefined,
    sql_generated: typeof data.sql_generated === 'string' ? data.sql_generated : undefined,
    metric_used: typeof data.metric_used === 'string' ? data.metric_used : null,
    assumptions,
    freshness,
    fallback_used: typeof data.fallback_used === 'boolean' ? data.fallback_used : false,
    fallback_type: typeof data.fallback_type === 'string' ? data.fallback_type : null,
    execution_time_ms: typeof data.execution_time_ms === 'number' ? data.execution_time_ms : undefined,
    bytes_processed: typeof data.bytes_processed === 'number' ? data.bytes_processed : undefined,
    rows_returned: typeof data.rows_returned === 'number' ? data.rows_returned : undefined,
    rows: normalizeRows(data.rows),
    results_summary: typeof data.results_summary === 'string' ? data.results_summary : undefined,
    estimated_cost_usd: typeof data.estimated_cost_usd === 'number' ? data.estimated_cost_usd : undefined,
    message: typeof data.message === 'string' ? data.message : undefined,
    intent: typeof data.intent === 'string' ? data.intent : undefined,
  };
}

function formatCell(value: CellValue) {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    return Math.abs(value) < 1 && value !== 0 ? value.toFixed(3) : value.toLocaleString();
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return value;
}

function formatBytes(bytes?: number) {
  if (!bytes) return '0 MB';
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function createHistoryItem(question: string, result: QueryResult): HistoryItem {
  return {
    id: result.query_id ?? `${Date.now()}`,
    question,
    status: result.status ?? 'success',
    createdAt: new Intl.DateTimeFormat('en', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date()),
  };
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    if (typeof window === 'undefined') return [];

    try {
      const saved = window.localStorage.getItem('datapilot-query-history');
      return saved ? (JSON.parse(saved) as HistoryItem[]) : [];
    } catch {
      return [];
    }
  });
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  useEffect(() => {
    window.localStorage.setItem('datapilot-query-history', JSON.stringify(history.slice(0, 8)));
  }, [history]);

  const rows = result?.rows?.length ? result.rows : result?.results_summary ? [] : demoRows;
  const sql = result?.sql_generated || result?.sql || '';
  const answer = result?.explanation || result?.answer || result?.message;
  const apiBase = 'same-origin /api/query';

  const handleQuery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-mock-token',
        },
        body: JSON.stringify({
          question: query,
          query,
          user_id: 'demo_user',
          user_role: 'sales_manager',
          tenant_id: 'demo_company',
        }),
      });

      const text = await response.text();
      const parsed: unknown = text ? JSON.parse(text) : {};
      const nextResult = normalizeResult(parsed);

      if (!response.ok) {
        nextResult.status = 'error';
        nextResult.message = nextResult.message || `Request failed with HTTP ${response.status}.`;
      }

      setResult(nextResult);
      setHistory((items) => [createHistoryItem(query, nextResult), ...items].slice(0, 8));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect to backend.';
      const nextResult: QueryResult = {
        status: 'error',
        message,
        fallback_used: true,
        fallback_type: 'frontend_connection_guard',
      };

      setResult(nextResult);
      setHistory((items) => [createHistoryItem(query, nextResult), ...items].slice(0, 8));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--ink)] text-sm font-semibold text-white">
              DP
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-[0] text-[var(--ink)]">DataPilot</h1>
              <p className="text-sm text-[var(--muted)]">Governed analytics workspace</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <StatusBadge tone="neutral" label="Sales manager" />
            <StatusBadge tone="ok" label="Admin scope" />
          </div>
        </header>

        <div className="grid flex-1 gap-5 py-5 lg:grid-cols-[270px_minmax(0,1fr)]">
          <aside className="border-r border-[var(--line)] pr-0 lg:pr-5">
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold text-[var(--muted)]">Recent queries</p>
              <div className="space-y-2">
                {history.length ? (
                  history.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setQuery(item.question)}
                      className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-3 text-left transition hover:border-[var(--accent)] hover:bg-[var(--mist)]"
                    >
                      <span className="line-clamp-2 text-sm text-[var(--ink)]">{item.question}</span>
                      <span className="mt-2 flex items-center justify-between text-xs text-[var(--muted)]">
                        <span>{item.createdAt}</span>
                        <span className={item.status === 'error' ? 'text-[var(--danger)]' : 'text-[var(--accent-dark)]'}>
                          {item.status}
                        </span>
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="rounded-lg border border-dashed border-[var(--line)] px-3 py-5 text-sm text-[var(--muted)]">
                    Query history appears after the first run.
                  </p>
                )}
              </div>
            </div>
          </aside>

          <section className="min-w-0">
            <form onSubmit={handleQuery} className="mb-5 rounded-lg border border-[var(--line)] bg-white p-3 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <label htmlFor="query" className="mb-2 block text-sm font-medium text-[var(--ink)]">
                Ask your data
              </label>
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_120px]">
                <input
                  id="query"
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="What was our revenue last month?"
                  className="h-12 min-w-0 rounded-md border border-[var(--line)] bg-[var(--mist)] px-4 text-base outline-none transition focus:border-[var(--accent)] focus:bg-white focus:ring-4 focus:ring-[var(--accent-soft)]"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !query.trim()}
                  className="h-12 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--accent-strong)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? 'Analyzing' : 'Analyze'}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {sampleQuestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => setQuery(question)}
                    className="rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)]"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </form>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
              <div className="space-y-5">
                <ResultOverview result={result} answer={answer} loading={loading} />
                <ResultTable rows={rows} />
                <ResultChart rows={rows} />
              </div>

              <div className="space-y-5">
                <RunStatus result={result} apiBase={apiBase} />
                <SemanticPanel result={result} />
                <SqlPanel sql={sql} />
                <FeedbackButtons feedback={feedback} setFeedback={setFeedback} disabled={!result} />
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }) {
  const toneClass = {
    ok: 'border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success)]',
    warn: 'border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning)]',
    danger: 'border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger)]',
    neutral: 'border-[var(--line)] bg-white text-[var(--muted)]',
  }[tone];

  return <span className={`rounded-full border px-2.5 py-1 ${toneClass}`}>{label}</span>;
}

function ResultOverview({
  result,
  answer,
  loading,
}: {
  result: QueryResult | null;
  answer?: string;
  loading: boolean;
}) {
  return (
    <section className="rounded-lg border border-[var(--line)] bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-[var(--muted)]">Analysis result</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[0] text-[var(--ink)]">
            {loading ? 'Resolving governed context' : result ? 'Answer' : 'Ready for a governed query'}
          </h2>
        </div>
        {result && <StatusBadge tone={result.status === 'error' ? 'danger' : 'ok'} label={result.status ?? 'success'} />}
      </div>
      <p className="min-h-20 text-base leading-7 text-[var(--body)]">
        {loading
          ? 'Checking semantic definitions, approved joins, policy scope, and execution safety.'
          : answer || 'Run a question to see the answer, generated SQL, semantic assumptions, and result previews.'}
      </p>
    </section>
  );
}

function ResultTable({ rows }: { rows: QueryRow[] }) {
  const columns = useMemo(() => Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 8), [rows]);

  return (
    <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-white">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Results table</h2>
        <span className="text-xs text-[var(--muted)]">{rows.length} rows</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-[var(--mist)] text-xs text-[var(--muted)]">
            <tr>
              {columns.map((column) => (
                <th key={column} className="border-b border-[var(--line)] px-4 py-3 font-semibold">
                  {column.replaceAll('_', ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${index}-${columns.join('-')}`} className="border-b border-[var(--line)] last:border-0">
                {columns.map((column) => (
                  <td key={column} className="px-4 py-3 text-[var(--body)]">
                    {formatCell(row[column] ?? null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ResultChart({ rows }: { rows: QueryRow[] }) {
  const numericColumns = useMemo(() => {
    const first = rows[0] ?? {};
    return Object.keys(first).filter((key) => typeof first[key] === 'number');
  }, [rows]);
  const labelColumn = useMemo(() => Object.keys(rows[0] ?? {}).find((key) => typeof rows[0]?.[key] === 'string'), [rows]);
  const valueColumn = numericColumns[0];
  const maxValue = Math.max(...rows.map((row) => (typeof row[valueColumn] === 'number' ? row[valueColumn] : 0)), 1);

  return (
    <section className="rounded-lg border border-[var(--line)] bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Chart view</h2>
        <span className="text-xs text-[var(--muted)]">{valueColumn ? valueColumn.replaceAll('_', ' ') : 'No numeric field'}</span>
      </div>
      <div className="space-y-3">
        {valueColumn ? (
          rows.slice(0, 6).map((row, index) => {
            const value = typeof row[valueColumn] === 'number' ? row[valueColumn] : 0;
            const label = labelColumn ? String(row[labelColumn]) : `Row ${index + 1}`;
            return (
              <div key={`${label}-${index}`} className="grid grid-cols-[110px_minmax(0,1fr)_80px] items-center gap-3 text-sm">
                <span className="truncate text-[var(--body)]">{label}</span>
                <span className="h-3 overflow-hidden rounded-full bg-[var(--mist)]">
                  <span
                    className="block h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                    style={{ width: `${Math.max((value / maxValue) * 100, 4)}%` }}
                  />
                </span>
                <span className="text-right tabular-nums text-[var(--muted)]">{formatCell(value)}</span>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-[var(--muted)]">Numeric results will render as bars after execution.</p>
        )}
      </div>
    </section>
  );
}

function RunStatus({ result, apiBase }: { result: QueryResult | null; apiBase: string }) {
  const fallbackLabel = result?.fallback_used ? result.fallback_type || 'Fallback used' : 'No fallback';
  const freshnessLabel = result?.freshness?.status || result?.freshness?.message || 'Freshness pending';

  return (
    <section className="rounded-lg border border-[var(--line)] bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-[var(--ink)]">Run status</h2>
      <div className="grid gap-3 text-sm">
        <StatusRow label="API" value={apiBase} />
        <StatusRow label="Freshness" value={freshnessLabel} />
        <StatusRow label="Fallback" value={fallbackLabel} tone={result?.fallback_used ? 'warn' : 'ok'} />
        <StatusRow label="Bytes" value={formatBytes(result?.bytes_processed)} />
        <StatusRow label="Cost" value={`$${(result?.estimated_cost_usd ?? 0).toFixed(6)}`} />
      </div>
    </section>
  );
}

function StatusRow({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'neutral';
}) {
  const valueClass = tone === 'ok' ? 'text-[var(--success)]' : tone === 'warn' ? 'text-[var(--warning)]' : 'text-[var(--body)]';

  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] pb-3 last:border-0 last:pb-0">
      <span className="text-[var(--muted)]">{label}</span>
      <span className={`max-w-[220px] break-words text-right ${valueClass}`}>{value}</span>
    </div>
  );
}

function SemanticPanel({ result }: { result: QueryResult | null }) {
  const assumptions = result?.assumptions?.length
    ? result.assumptions
    : ['Metric definitions are resolved server-side.', 'Approved join paths are required before SQL execution.'];

  return (
    <section className="rounded-lg border border-[var(--line)] bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-[var(--ink)]">Semantic context</h2>
      <div className="mb-4 rounded-md bg-[var(--mist)] p-3">
        <p className="text-xs text-[var(--muted)]">Metric definition</p>
        <p className="mt-1 text-sm font-medium text-[var(--ink)]">{result?.metric_used || result?.intent || 'Awaiting resolved metric'}</p>
      </div>
      <ul className="space-y-2 text-sm text-[var(--body)]">
        {assumptions.map((assumption) => (
          <li key={assumption} className="border-l-2 border-[var(--accent)] pl-3">
            {assumption}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SqlPanel({ sql }: { sql: string }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--ink)] text-white">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-semibold">Generated SQL</h2>
        <span className="text-xs text-white/55">BigQuery</span>
      </div>
      <pre className="max-h-[320px] overflow-auto p-5 font-mono text-xs leading-6 text-[var(--code)]">
        {sql || 'SQL appears here after a successful governed generation.'}
      </pre>
    </section>
  );
}

function FeedbackButtons({
  feedback,
  setFeedback,
  disabled,
}: {
  feedback: FeedbackState;
  setFeedback: (feedback: FeedbackState) => void;
  disabled: boolean;
}) {
  return (
    <section className="rounded-lg border border-[var(--line)] bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-[var(--ink)]">Feedback</h2>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setFeedback('helpful')}
          className={`rounded-md border px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
            feedback === 'helpful'
              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]'
              : 'border-[var(--line)] text-[var(--body)] hover:border-[var(--accent)]'
          }`}
        >
          Helpful
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setFeedback('needs-work')}
          className={`rounded-md border px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
            feedback === 'needs-work'
              ? 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]'
              : 'border-[var(--line)] text-[var(--body)] hover:border-[var(--danger)]'
          }`}
        >
          Needs work
        </button>
      </div>
    </section>
  );
}
