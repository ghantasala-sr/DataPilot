'use client';

import { FormEvent, ReactNode, RefObject, useEffect, useMemo, useRef, useState } from 'react';

type CellValue = string | number | boolean | null;
type QueryRow = Record<string, CellValue>;

type Freshness = {
  status?: string;
  dataset?: string;
  updated_at?: string;
  message?: string;
};

type RecommendedVisualization = {
  type?: VizMode;
  reason?: string;
  x?: string;
  y?: string;
  geo?: string;
};

type QueryPlan = {
  complexity?: string;
  strategy?: string;
  steps?: string[];
  required_tables?: string[];
  metrics?: string[];
  dimensions?: string[];
  approved_join_paths?: string[];
  grain?: string;
  filters?: string[];
  visualization?: RecommendedVisualization;
  policy_count?: number;
  template_id?: string | null;
};

type AgentStep = {
  agent?: string;
  role?: string;
  status?: string;
  summary?: string;
  evidence?: string[];
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
  plan?: QueryPlan | null;
  agents?: AgentStep[];
  complexity?: string | null;
  recommended_visualization?: RecommendedVisualization | null;
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

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status?: string;
  createdAt: string;
  result?: QueryResult;
};

type FeedbackState = 'helpful' | 'needs-work' | null;
type VizMode = 'chart' | 'map' | 'table';

const sampleQuestions = [
  'What was monthly revenue by product category?',
  'Which campaign had the highest ROI?',
  'Show delivery delay rate by customer state.',
  'Why did gross revenue change month over month by customer state, and is the change explained more by order volume, product category mix, or delivery delays?',
];

const demoRows: QueryRow[] = [
  { customer_state: 'SP', gross_revenue: 184200, total_orders: 831, delay_rate: 0.034 },
  { customer_state: 'RJ', gross_revenue: 137650, total_orders: 690, delay_rate: 0.027 },
  { customer_state: 'MG', gross_revenue: 94220, total_orders: 544, delay_rate: 0.019 },
  { customer_state: 'PR', gross_revenue: 81710, total_orders: 402, delay_rate: 0.041 },
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

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeVisualization(value: unknown): RecommendedVisualization | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const type = typeof raw.type === 'string' && ['chart', 'map', 'table'].includes(raw.type) ? (raw.type as VizMode) : undefined;

  return {
    type,
    reason: typeof raw.reason === 'string' ? raw.reason : undefined,
    x: typeof raw.x === 'string' ? raw.x : undefined,
    y: typeof raw.y === 'string' ? raw.y : undefined,
    geo: typeof raw.geo === 'string' ? raw.geo : undefined,
  };
}

function normalizePlan(value: unknown): QueryPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  return {
    complexity: typeof raw.complexity === 'string' ? raw.complexity : undefined,
    strategy: typeof raw.strategy === 'string' ? raw.strategy : undefined,
    steps: normalizeStringList(raw.steps),
    required_tables: normalizeStringList(raw.required_tables),
    metrics: normalizeStringList(raw.metrics),
    dimensions: normalizeStringList(raw.dimensions),
    approved_join_paths: normalizeStringList(raw.approved_join_paths),
    grain: typeof raw.grain === 'string' ? raw.grain : undefined,
    filters: normalizeStringList(raw.filters),
    visualization: normalizeVisualization(raw.visualization) ?? undefined,
    policy_count: typeof raw.policy_count === 'number' ? raw.policy_count : undefined,
    template_id: typeof raw.template_id === 'string' ? raw.template_id : null,
  };
}

function normalizeAgents(value: unknown): AgentStep[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      agent: typeof item.agent === 'string' ? item.agent : undefined,
      role: typeof item.role === 'string' ? item.role : undefined,
      status: typeof item.status === 'string' ? item.status : undefined,
      summary: typeof item.summary === 'string' ? item.summary : undefined,
      evidence: normalizeStringList(item.evidence),
    }));
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
  const plan = normalizePlan(data.plan);
  const recommendedVisualization = normalizeVisualization(data.recommended_visualization) ?? plan?.visualization ?? null;

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
    plan,
    agents: normalizeAgents(data.agents),
    complexity: typeof data.complexity === 'string' ? data.complexity : plan?.complexity ?? null,
    recommended_visualization: recommendedVisualization,
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

function parseApiPayload(text: string): unknown {
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return {
      status: 'error',
      message: text,
      fallback_used: true,
      fallback_type: 'frontend_non_json_response',
    };
  }
}

function formatCell(value: CellValue) {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    return Math.abs(value) < 1 && value !== 0 ? value.toFixed(3) : value.toLocaleString();
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return value;
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatBytes(bytes?: number) {
  if (!bytes) return '0 MB';
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatClock() {
  return new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date());
}

function answerText(result: QueryResult | null) {
  return result?.explanation || result?.answer || result?.message || '';
}

function inferLabelColumn(rows: QueryRow[]) {
  const first = rows[0] ?? {};
  return Object.keys(first).find((key) => typeof first[key] === 'string');
}

function inferNumberColumn(rows: QueryRow[]) {
  const first = rows[0] ?? {};
  const priority = [
    'revenue_change',
    'gross_revenue',
    'total_revenue',
    'monthly_revenue',
    'revenue',
    'roi',
    'delay_rate',
    'total_orders',
    'orders',
    'order_volume_change',
  ];
  const numericKeys = Object.keys(first).filter((key) => typeof first[key] === 'number');
  return priority.find((key) => numericKeys.includes(key)) || numericKeys[0];
}

function stripMarkdown(value: string) {
  return value
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[-*]\s*/, '')
    .replace(/^\d+\.\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '')
    .trim();
}

function renderInlineMarkdown(value: string) {
  const parts = value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={`${part}-${index}`} className="font-semibold text-[var(--ink)]">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={`${part}-${index}`} className="rounded bg-[var(--mist)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--ink)]">
          {part.slice(1, -1)}
        </code>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function normalizeAnswerLines(text: string) {
  return text
    .replace(/\s+(\d+\.\s+\*\*)/g, '\n$1')
    .replace(/\n\s*[-]{2,}\s*\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^[-]{2,}$/.test(line));
}

function summarizeForChat(result: QueryResult) {
  if (result.status === 'error') {
    return result.message || result.answer || 'The query could not be completed.';
  }

  const rows = typeof result.rows_returned === 'number' ? `${result.rows_returned} rows` : 'results';
  const cost = typeof result.estimated_cost_usd === 'number' ? `$${result.estimated_cost_usd.toFixed(6)}` : '$0.000000';
  const complexity = result.complexity ? `${result.complexity} plan` : 'governed plan';
  const agentCount = result.agents?.length ? `${result.agents.length} agents` : 'agents';
  return `Completed with ${complexity}. ${rows} returned, ${agentCount} checked it, estimated query cost ${cost}.`;
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [vizMode, setVizMode] = useState<VizMode>('chart');
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === 'undefined') return [];

    try {
      const saved = window.localStorage.getItem('datapilot-chat-history');
      return saved ? (JSON.parse(saved) as ChatMessage[]) : [];
    } catch {
      return [];
    }
  });
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.localStorage.setItem('datapilot-chat-history', JSON.stringify(messages.slice(-16)));
  }, [messages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  const rows = result ? result.rows ?? [] : demoRows;
  const sql = result?.sql_generated || result?.sql || '';
  const answer = answerText(result);

  const handleQuery = async (event?: FormEvent<HTMLFormElement>, nextQuery?: string) => {
    event?.preventDefault();
    const question = (nextQuery ?? query).trim();
    if (!question) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      createdAt: formatClock(),
    };

    setMessages((items) => [...items, userMessage]);
    setQuery('');
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
          question,
          query: question,
          user_id: 'demo_user',
          user_role: 'sales_manager',
          tenant_id: 'demo_company',
        }),
      });

      const text = await response.text();
      const parsed = parseApiPayload(text);
      const nextResult = normalizeResult(parsed);

      if (!response.ok) {
        nextResult.status = 'error';
        nextResult.message = nextResult.message || `Request failed with HTTP ${response.status}.`;
      }

      setResult(nextResult);
      setMessages((items) => [
        ...items,
        {
          id: nextResult.query_id ?? `assistant-${Date.now()}`,
          role: 'assistant',
          content: summarizeForChat(nextResult),
          status: nextResult.status,
          createdAt: formatClock(),
          result: nextResult,
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect to backend.';
      const nextResult: QueryResult = {
        status: 'error',
        message,
        fallback_used: true,
        fallback_type: 'frontend_connection_guard',
      };

      setResult(nextResult);
      setMessages((items) => [
        ...items,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: message,
          status: 'error',
          createdAt: formatClock(),
          result: nextResult,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-4 py-4 sm:px-5 xl:px-6">
        <header className="audit-ribbon sticky top-3 z-30 overflow-hidden rounded-xl border border-black/10 bg-[var(--nav)] px-4 py-3 pl-6 text-white shadow-lg shadow-black/10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-[220px] items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-[var(--accent)] text-sm font-semibold text-[var(--ink)] shadow-sm">
                DP
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-[0] text-white">DataPilot</h1>
                <p className="text-xs text-white/60">Governed analytics workspace</p>
              </div>
            </div>

            <nav aria-label="Workspace navigation" className="order-3 flex w-full items-center gap-1 overflow-x-auto rounded-lg bg-white/10 p-1 text-sm md:order-2 md:w-auto">
              {['Ask', 'Visualize', 'Semantic plan', 'SQL'].map((item, index) => (
                <button
                  key={item}
                  type="button"
                  className={`whitespace-nowrap rounded-md px-3 py-2 transition ${
                    index === 0 ? 'bg-[var(--accent)] text-[var(--ink)] shadow-sm' : 'text-white/65 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {item}
                </button>
              ))}
            </nav>

            <div className="order-2 flex items-center gap-2 text-xs text-white/65 md:order-3">
              <StatusBadge tone="neutral" label="Sales manager" />
              <StatusBadge tone="ok" label="Admin scope" />
            </div>
          </div>
        </header>

        <div className="grid flex-1 gap-5 py-5 xl:grid-cols-[340px_minmax(0,1fr)_340px]">
          <ChatWindow
            messages={messages}
            loading={loading}
            query={query}
            setQuery={setQuery}
            onSubmit={handleQuery}
            onPrompt={(question) => void handleQuery(undefined, question)}
            endRef={chatEndRef}
          />

          <section className="min-w-0 space-y-5">
            <AnswerPanel result={result} answer={answer} loading={loading} />
            <VisualizationAgent rows={rows} mode={vizMode} setMode={setVizMode} result={result} />
          </section>

          <aside className="min-w-0 space-y-5">
            <RunStatus result={result} />
            <PlanningPanel result={result} loading={loading} />
            <SemanticPanel result={result} />
            <SqlPanel sql={sql} />
            <FeedbackButtons feedback={feedback} setFeedback={setFeedback} disabled={!result} />
          </aside>
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
    neutral: 'border-white/15 bg-white/10 text-current',
  }[tone];

  return <span className={`rounded-full border px-2.5 py-1 ${toneClass}`}>{label}</span>;
}

function ChatWindow({
  messages,
  loading,
  query,
  setQuery,
  onSubmit,
  onPrompt,
  endRef,
}: {
  messages: ChatMessage[];
  loading: boolean;
  query: string;
  setQuery: (query: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onPrompt: (question: string) => void;
  endRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <aside className="audit-ribbon flex min-h-[720px] flex-col overflow-hidden rounded-xl bg-[var(--nav)] pl-[5px] text-white shadow-lg shadow-black/10">
      <div className="border-b border-white/10 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white/45">Chat window</p>
        <h2 className="mt-1 text-lg font-semibold text-white">Ask, refine, compare</h2>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length ? (
          messages.map((message) => <ChatBubble key={message.id} message={message} />)
        ) : (
          <div className="rounded-lg border border-dashed border-white/15 bg-white/5 px-4 py-5 text-sm text-white/55">
            Start with a business question. Follow-ups stay here so the workspace reads like an analysis session.
          </div>
        )}
        {loading && (
          <div className="rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/75">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
              Resolving semantics, SQL, cost, and visualization.
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {sampleQuestions.map((question) => (
            <button
              key={question}
              type="button"
              disabled={loading}
              onClick={() => onPrompt(question)}
              className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/60 transition hover:border-[var(--accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {question}
            </button>
          ))}
        </div>
        <form onSubmit={onSubmit} className="grid gap-2">
          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask a governed analytics question..."
            className="min-h-24 resize-none rounded-md border border-white/15 bg-white/10 px-3 py-3 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-[var(--accent)] focus:bg-white/15 focus:ring-4 focus:ring-[var(--accent)]/20"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="h-11 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--accent-strong)] focus:outline-none focus:ring-4 focus:ring-[var(--accent)]/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Analyzing' : 'Send to DataPilot'}
          </button>
        </form>
      </div>
    </aside>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isError = message.status === 'error';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] rounded-lg px-3 py-3 text-sm ${
          isUser
            ? 'bg-[var(--ink)] text-white'
            : isError
              ? 'border border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger)]'
              : 'border border-white/10 bg-white/95 text-[var(--body)]'
        }`}
      >
        <p className="leading-6">{message.content}</p>
        <p className={`mt-2 text-[11px] ${isUser ? 'text-white/55' : 'text-[var(--muted)]'}`}>{message.createdAt}</p>
      </div>
    </div>
  );
}

function AnswerPanel({
  result,
  answer,
  loading,
}: {
  result: QueryResult | null;
  answer: string;
  loading: boolean;
}) {
  return (
    <section className="audit-ribbon overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 pl-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">AI answer</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[0] text-[var(--ink)]">
            {loading ? 'Working through the governed query' : result ? 'Formatted response' : 'Ready for analysis'}
          </h2>
        </div>
        {result && <StatusBadge tone={result.status === 'error' ? 'danger' : 'ok'} label={result.status ?? 'success'} />}
      </div>
      {loading ? (
        <p className="min-h-28 text-base leading-7 text-[var(--body)]">
          Checking semantic definitions, approved joins, policy scope, cost estimate, warehouse execution, and visualization fit.
        </p>
      ) : answer ? (
        <FormattedAnswer text={answer} />
      ) : (
        <p className="min-h-28 text-base leading-7 text-[var(--body)]">
          Ask a question in the chat window to see a formatted answer, chart/map options, generated SQL, and execution status.
        </p>
      )}
    </section>
  );
}

function FormattedAnswer({ text }: { text: string }) {
  const lines = normalizeAnswerLines(text);
  const elements: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (/^#{1,6}\s+/.test(line)) {
      const level = line.match(/^#{1,6}/)?.[0].length ?? 3;
      elements.push(
        <h3
          key={`${line}-${index}`}
          className={level <= 2 ? 'text-lg font-semibold text-[var(--ink)]' : 'text-sm font-semibold text-[var(--ink)]'}
        >
          {renderInlineMarkdown(stripMarkdown(line))}
        </h3>,
      );
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, ''));
        index += 1;
      }
      elements.push(
        <ul key={`${line}-${index}`} className="space-y-2">
          {items.map((item) => (
            <li key={item} className="flex gap-3 rounded-md bg-[var(--mist)] px-3 py-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
              <span>{renderInlineMarkdown(item)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ''));
        index += 1;
      }
      elements.push(
        <ol key={`${line}-${index}`} className="space-y-2">
          {items.map((item, itemIndex) => (
            <li key={item} className="grid grid-cols-[28px_1fr] gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent-dark)]">
                {itemIndex + 1}
              </span>
              <span>{renderInlineMarkdown(item)}</span>
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    if (line.endsWith(':') && line.length < 96) {
      elements.push(
        <h3 key={`${line}-${index}`} className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent-dark)]">
          {renderInlineMarkdown(stripMarkdown(line))}
        </h3>,
      );
      index += 1;
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      !/^#{1,6}\s+/.test(lines[index]) &&
      !/^[-*]\s+/.test(lines[index]) &&
      !/^\d+\.\s+/.test(lines[index]) &&
      !(lines[index].endsWith(':') && lines[index].length < 96)
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }

    elements.push(
      <p key={`${line}-${index}`} className="text-[15px] leading-7 text-[var(--body)]">
        {renderInlineMarkdown(paragraph.join(' '))}
      </p>,
    );
  }

  return (
    <div className="space-y-4 text-[15px] leading-7 text-[var(--body)]">
      {elements.length ? elements : <p>{text}</p>}
    </div>
  );
}

function VisualizationAgent({
  rows,
  mode,
  setMode,
  result,
}: {
  rows: QueryRow[];
  mode: VizMode;
  setMode: (mode: VizMode) => void;
  result: QueryResult | null;
}) {
  const labelColumn = inferLabelColumn(rows);
  const valueColumn = inferNumberColumn(rows);
  const hasRows = rows.length > 0;
  const recommendation = result?.recommended_visualization ?? result?.plan?.visualization;

  return (
    <section className="audit-ribbon overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] pl-[5px] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Visualization agent</p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--ink)]">
            {valueColumn ? `${valueColumn.replaceAll('_', ' ')} by ${labelColumn?.replaceAll('_', ' ') || 'row'}` : 'Awaiting numeric output'}
          </h2>
        </div>
        <div className="grid grid-cols-3 rounded-md border border-[var(--line)] bg-[var(--mist)] p-1 text-xs">
          {(['chart', 'map', 'table'] as VizMode[]).map((nextMode) => (
            <button
              key={nextMode}
              type="button"
              onClick={() => setMode(nextMode)}
              className={`rounded px-3 py-1.5 capitalize transition ${
                mode === nextMode ? 'bg-[var(--accent)] text-[var(--ink)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
            >
              {nextMode}
            </button>
          ))}
        </div>
      </div>

      {!hasRows ? (
        <div className="px-5 py-12 text-sm text-[var(--muted)]">Successful query rows will render here.</div>
      ) : mode === 'map' ? (
        <MapView rows={rows} />
      ) : mode === 'table' ? (
        <ResultTable rows={rows} compact />
      ) : (
        <ChartView rows={rows} />
      )}

      <div className="border-t border-[var(--line)] px-5 py-3 text-xs text-[var(--muted)]">
        {result?.status === 'error'
          ? 'Visualization paused until the query succeeds.'
          : recommendation?.reason || 'Agent chooses dimensions from returned fields; switch modes to inspect shape and geography.'}
      </div>
    </section>
  );
}

function ChartView({ rows }: { rows: QueryRow[] }) {
  const labelColumn = inferLabelColumn(rows);
  const valueColumn = inferNumberColumn(rows);
  const maxValue = Math.max(...rows.map((row) => (typeof row[valueColumn] === 'number' ? row[valueColumn] : 0)), 1);

  if (!valueColumn) {
    return <div className="px-5 py-12 text-sm text-[var(--muted)]">No numeric field found for a chart.</div>;
  }

  return (
    <div className="space-y-3 p-5">
      {rows.slice(0, 12).map((row, index) => {
        const value = typeof row[valueColumn] === 'number' ? row[valueColumn] : 0;
        const label = labelColumn ? String(row[labelColumn]) : `Row ${index + 1}`;
        return (
          <div key={`${label}-${index}`} className="grid grid-cols-[minmax(90px,150px)_minmax(0,1fr)_96px] items-center gap-3 text-sm">
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
      })}
    </div>
  );
}

function MapView({ rows }: { rows: QueryRow[] }) {
  const stateColumn = useMemo(() => {
    const first = rows[0] ?? {};
    return Object.keys(first).find((key) => key.toLowerCase().includes('state')) || inferLabelColumn(rows);
  }, [rows]);
  const valueColumn = inferNumberColumn(rows);
  const points = useMemo(() => aggregateMapPoints(rows, stateColumn, valueColumn), [rows, stateColumn, valueColumn]);
  const maxMagnitude = Math.max(...points.map((point) => Math.abs(point.value)), 1);
  const rankedPoints = [...points].sort((left, right) => Math.abs(right.value) - Math.abs(left.value));

  return (
    <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="relative min-h-[430px] overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--map-bg)]">
        <div className="absolute left-4 top-4 z-10 rounded-md border border-[var(--line)] bg-[var(--surface)]/90 px-3 py-2 backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Brazil state map</p>
          <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">{valueColumn?.replaceAll('_', ' ') || 'value'} by UF</p>
        </div>
        <svg viewBox="0 0 560 430" className="h-full min-h-[430px] w-full">
          <defs>
            <filter id="mapShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#123126" floodOpacity="0.12" />
            </filter>
          </defs>
          <path
            d="M300 27 366 49 420 43 467 78 482 125 519 158 501 204 522 253 482 280 463 332 421 358 391 401 332 384 289 407 244 379 191 377 165 329 111 309 112 261 73 222 102 176 94 128 142 97 167 51 226 61Z"
            fill="#e8edf3"
            filter="url(#mapShadow)"
            stroke="#c5cfda"
            strokeWidth="2.5"
          />
          <path d="M226 61 253 129 221 190 166 209 102 176 94 128 142 97 167 51Z" fill="#f5f7fa" stroke="#d7dee7" />
          <path d="M253 129 329 111 391 139 389 207 319 230 221 190Z" fill="#eef2f6" stroke="#d7dee7" />
          <path d="M391 139 482 125 519 158 501 204 522 253 447 252 389 207Z" fill="#f9fafc" stroke="#d7dee7" />
          <path d="M166 209 221 190 319 230 304 305 220 321 165 329 111 309 112 261 73 222Z" fill="#fbfcfd" stroke="#d7dee7" />
          <path d="M319 230 389 207 447 252 421 358 391 401 332 384 304 305Z" fill="#f0f4f8" stroke="#d7dee7" />
          <path d="M220 321 304 305 332 384 289 407 244 379 191 377 165 329Z" fill="#f6f8fb" stroke="#d7dee7" />
          {points.map((point) => {
            const normalized = Math.abs(point.value) / maxMagnitude;
            const radius = 7 + normalized * 24;
            const labelVisible = rankedPoints.slice(0, 8).some((ranked) => ranked.state === point.state);
            const isNegative = point.value < 0;
            return (
              <g key={point.state}>
                <circle cx={point.x} cy={point.y} r={radius + 5} fill={isNegative ? '#b94b4b' : '#c8792a'} opacity="0.18" />
                <circle cx={point.x} cy={point.y} r={radius} fill={isNegative ? '#b94b4b' : '#7a3e14'} opacity={0.42 + normalized * 0.42} />
                <circle cx={point.x} cy={point.y} r={Math.max(radius * 0.36, 4)} fill="#fffdf8" opacity="0.92" />
                {labelVisible && (
                  <text x={point.x} y={point.y - radius - 8} textAnchor="middle" className="fill-[var(--ink)] text-[12px] font-semibold">
                    {point.state}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <div className="absolute bottom-4 left-4 right-4 grid gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)]/90 p-3 text-xs text-[var(--muted)] backdrop-blur sm:grid-cols-[1fr_auto] sm:items-center">
          <span>Bubble size and opacity follow the selected measure. States without coordinates are still included in the ranking.</span>
          <span className="flex items-center gap-3 text-[var(--body)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-[var(--accent)] opacity-80" />
              positive
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-[var(--danger)] opacity-80" />
              negative
            </span>
          </span>
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">State ranking</p>
          <h3 className="mt-1 text-base font-semibold text-[var(--ink)]">Top Brazil states</h3>
        </div>
        {rankedPoints.slice(0, 10).map((point, index) => (
          <div key={point.state} className="grid grid-cols-[32px_1fr_auto] items-center gap-3 border-b border-[var(--line)] pb-2 text-sm last:border-0">
            <span className="text-xs tabular-nums text-[var(--muted)]">{String(index + 1).padStart(2, '0')}</span>
            <span>
              <span className="font-medium text-[var(--body)]">{point.state}</span>
              <span className="ml-2 text-xs text-[var(--muted)]">{BRAZIL_STATES[point.state]?.name || 'Brazil state'}</span>
            </span>
            <span className="tabular-nums text-[var(--ink)]">{formatCompactNumber(point.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function aggregateMapPoints(rows: QueryRow[], stateColumn?: string, valueColumn?: string) {
  const totals = new Map<string, number>();

  rows.forEach((row) => {
    const rawState = stateColumn ? row[stateColumn] : null;
    const state = typeof rawState === 'string' ? rawState.toUpperCase().slice(0, 2) : 'SP';
    const rawValue = valueColumn ? row[valueColumn] : null;
    const value = typeof rawValue === 'number' ? rawValue : 1;
    totals.set(state, (totals.get(state) || 0) + value);
  });

  const entries = Array.from(totals.entries());
  const maxFallbackColumns = 4;
  return entries.map(([state, value], index) => ({
    state,
    value,
    x: BRAZIL_STATES[state]?.x ?? 126 + (index % maxFallbackColumns) * 54,
    y: BRAZIL_STATES[state]?.y ?? 132 + Math.floor(index / maxFallbackColumns) * 48,
  }));
}

const BRAZIL_STATES: Record<string, { name: string; x: number; y: number }> = {
  AC: { name: 'Acre', x: 122, y: 171 },
  AL: { name: 'Alagoas', x: 456, y: 199 },
  AM: { name: 'Amazonas', x: 190, y: 117 },
  AP: { name: 'Amapa', x: 338, y: 69 },
  BA: { name: 'Bahia', x: 401, y: 236 },
  CE: { name: 'Ceara', x: 431, y: 149 },
  DF: { name: 'Distrito Federal', x: 338, y: 247 },
  ES: { name: 'Espirito Santo', x: 410, y: 306 },
  GO: { name: 'Goias', x: 316, y: 251 },
  MA: { name: 'Maranhao', x: 378, y: 136 },
  MG: { name: 'Minas Gerais', x: 365, y: 297 },
  MS: { name: 'Mato Grosso do Sul', x: 262, y: 302 },
  MT: { name: 'Mato Grosso', x: 253, y: 226 },
  PA: { name: 'Para', x: 303, y: 119 },
  PB: { name: 'Paraiba', x: 462, y: 167 },
  PE: { name: 'Pernambuco', x: 452, y: 184 },
  PI: { name: 'Piaui', x: 395, y: 167 },
  PR: { name: 'Parana', x: 305, y: 349 },
  RJ: { name: 'Rio de Janeiro', x: 389, y: 332 },
  RN: { name: 'Rio Grande do Norte', x: 463, y: 148 },
  RO: { name: 'Rondonia', x: 176, y: 207 },
  RR: { name: 'Roraima', x: 211, y: 59 },
  RS: { name: 'Rio Grande do Sul', x: 291, y: 397 },
  SC: { name: 'Santa Catarina', x: 318, y: 374 },
  SE: { name: 'Sergipe', x: 449, y: 214 },
  SP: { name: 'Sao Paulo', x: 340, y: 333 },
  TO: { name: 'Tocantins', x: 342, y: 183 },
};

function ResultTable({ rows, compact = false }: { rows: QueryRow[]; compact?: boolean }) {
  const columns = useMemo(() => Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 8), [rows]);

  return (
    <div className={compact ? 'max-h-[420px] overflow-auto' : 'overflow-x-auto'}>
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 bg-[var(--mist)] text-xs text-[var(--muted)]">
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
  );
}

function RunStatus({ result }: { result: QueryResult | null }) {
  const fallbackLabel = result?.fallback_used ? result.fallback_type || 'Fallback used' : 'No fallback';
  const freshnessLabel = result?.freshness?.status || result?.freshness?.message || 'Freshness pending';

  return (
    <section className="audit-ribbon overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 pl-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-[var(--ink)]">Run status</h2>
      <div className="grid gap-3 text-sm">
        <StatusRow label="API" value="same-origin /api/query" />
        <StatusRow label="Freshness" value={freshnessLabel} />
        <StatusRow label="Fallback" value={fallbackLabel} tone={result?.fallback_used ? 'warn' : 'ok'} />
        <StatusRow label="Rows" value={`${result?.rows_returned ?? 0}`} />
        <StatusRow label="Bytes" value={formatBytes(result?.bytes_processed)} />
        <StatusRow label="Cost" value={`$${(result?.estimated_cost_usd ?? 0).toFixed(6)}`} />
      </div>
    </section>
  );
}

function PlanningPanel({ result, loading }: { result: QueryResult | null; loading: boolean }) {
  const plan = result?.plan;
  const agents = result?.agents?.length ? result.agents : [];
  const tables = plan?.required_tables?.length ? plan.required_tables : ['awaiting table plan'];
  const metrics = plan?.metrics?.length ? plan.metrics : ['awaiting metric plan'];
  const dimensions = plan?.dimensions?.length ? plan.dimensions : ['awaiting dimension plan'];
  const visibleAgents = agents.slice(0, 6);

  return (
    <section className="audit-ribbon overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 pl-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--ink)]">Planning agents</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {loading
              ? 'Planning query route'
              : plan?.strategy || 'The plan appears after the first governed query.'}
          </p>
        </div>
        <StatusBadge tone={result?.status === 'error' ? 'danger' : plan ? 'ok' : 'neutral'} label={plan?.complexity || 'idle'} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
        <MiniStat label="Grain" value={plan?.grain || 'pending'} />
        <MiniStat label="Visual" value={plan?.visualization?.type || result?.recommended_visualization?.type || 'pending'} />
      </div>

      <div className="mb-4 space-y-3">
        <TagGroup label="Tables" values={tables} />
        <TagGroup label="Metrics" values={metrics} />
        <TagGroup label="Dimensions" values={dimensions} />
      </div>

      <div className="space-y-3">
        {visibleAgents.length ? (
          visibleAgents.map((agent) => (
            <div key={`${agent.agent}-${agent.summary}`} className="border-l-2 border-[var(--accent)] pl-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-[var(--ink)]">{agent.agent || 'Agent'}</p>
                <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">{agent.status || 'ready'}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-[var(--body)]">{agent.summary || agent.role || 'Waiting for query execution.'}</p>
            </div>
          ))
        ) : (
          <div className="rounded-md bg-[var(--mist)] p-3 text-sm text-[var(--muted)]">
            Planner, semantic, SQL, guardrails, warehouse, visualization, and explanation agents will report here.
          </div>
        )}
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[var(--mist)] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-[var(--ink)]">{value}</p>
    </div>
  );
}

function TagGroup({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.slice(0, 5).map((value) => (
          <span key={value} className="rounded-full border border-[var(--line)] bg-[var(--mist)] px-2 py-1 text-xs text-[var(--body)]">
            {value.replaceAll('_', ' ')}
          </span>
        ))}
      </div>
    </div>
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
    <section className="audit-ribbon overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 pl-6 shadow-sm">
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
    <section className="audit-ribbon overflow-hidden rounded-xl border border-black/10 bg-[var(--nav)] pl-[5px] text-white shadow-sm">
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
    <section className="audit-ribbon overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 pl-6 shadow-sm">
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
