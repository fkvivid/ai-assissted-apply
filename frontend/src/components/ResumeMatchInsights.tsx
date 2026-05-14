import type { CompareResumeJobMatchResponse } from "../api";

type Props = {
  data: CompareResumeJobMatchResponse | null;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
};

function ScoreRing({
  score,
  label,
  sub,
}: {
  score: number;
  label: string;
  sub?: string;
}) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className="relative grid size-[7.25rem] place-items-center rounded-full p-[3px] shadow-lg shadow-indigo-500/15 dark:shadow-indigo-900/40"
        style={{
          background: `conic-gradient(from -90deg, rgb(99 102 241) ${pct}%, rgb(212 212 216) ${pct}%)`,
        }}
      >
        <div className="flex size-[calc(100%-6px)] flex-col items-center justify-center rounded-full bg-[var(--color-surface)] dark:bg-zinc-950">
          <span className="text-[2rem] font-bold tabular-nums leading-none tracking-tight text-[var(--color-ink)]">
            {pct}
          </span>
          <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
            / 100
          </span>
        </div>
      </div>
      <p className="mt-3 text-[12px] font-semibold text-[var(--color-ink)]">{label}</p>
      {sub ? (
        <p className="mt-0.5 max-w-[11rem] text-[11px] text-[var(--color-muted)]">{sub}</p>
      ) : null}
    </div>
  );
}

function AxisRow({
  title,
  oldScore,
  newScore,
}: {
  title: string;
  oldScore: number;
  newScore: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold text-[var(--color-ink)]">{title}</span>
        <span className="text-[11px] tabular-nums text-[var(--color-muted)]">
          <span className="text-zinc-500 dark:text-zinc-400">{oldScore}</span>
          <span className="mx-1 text-[var(--color-border)]">→</span>
          <span className="font-semibold text-indigo-600 dark:text-indigo-400">
            {newScore}
          </span>
        </span>
      </div>
      <div className="flex h-2 gap-1.5 overflow-hidden rounded-full">
        <div
          className="h-full min-w-0 flex-1 rounded-full bg-zinc-200 dark:bg-zinc-700"
          title="Before"
        >
          <div
            className="h-full rounded-full bg-zinc-400 transition-[width] dark:bg-zinc-500"
            style={{ width: `${oldScore}%` }}
          />
        </div>
        <div
          className="h-full min-w-0 flex-1 rounded-full bg-indigo-100 dark:bg-indigo-950/80"
          title="After"
        >
          <div
            className="h-full rounded-full bg-indigo-600 transition-[width] dark:bg-indigo-400"
            style={{ width: `${newScore}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function ResumeMatchInsights({ data, loading, error, onRetry }: Props) {
  if (!loading && !error && !data) return null;

  const lift = data?.match_lift ?? 0;
  const liftTone =
    lift > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : lift < 0
        ? "text-amber-700 dark:text-amber-400"
        : "text-[var(--color-muted)]";

  return (
    <div className="relative mb-8 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-indigo-500/[0.07] via-violet-500/[0.06] to-fuchsia-500/[0.05] p-[1px] shadow-[0_20px_50px_-24px_rgba(79,70,229,0.35)] dark:from-indigo-500/15 dark:via-violet-600/10 dark:to-fuchsia-600/10 dark:shadow-indigo-950/50">
      <div className="rounded-[15px] bg-[var(--color-surface)] px-5 py-6 sm:px-7 sm:py-7 dark:bg-zinc-950/90">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-indigo-600 dark:text-indigo-400">
              Job fit overview
            </p>
            <h3 className="mt-1.5 text-lg font-semibold tracking-tight text-[var(--color-ink)] sm:text-xl">
              Before and after this generation
            </h3>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-[var(--color-muted)]">
              Scores compare this posting to your saved resume and your new
              tailored LaTeX, using the model you selected above.
            </p>
          </div>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={loading}
              className="shrink-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3.5 py-2 text-[12px] font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-border)]/30 disabled:opacity-50 dark:border-zinc-600"
            >
              {loading ? "Scoring…" : "Refresh score"}
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="mt-8 flex items-center gap-3 rounded-xl border border-[var(--color-border)]/80 bg-[var(--color-surface-elevated)]/50 px-4 py-6 dark:bg-zinc-900/40">
            <span className="size-6 shrink-0 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600 dark:border-indigo-900 dark:border-t-indigo-400" />
            <div>
              <p className="text-[14px] font-semibold text-[var(--color-ink)]">
                Estimating alignment…
              </p>
              <p className="mt-0.5 text-[12px] text-[var(--color-muted)]">
                Comparing your original resume, tailored output, and the job description.
              </p>
            </div>
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-3 text-[13px] font-medium text-[var(--color-danger-text)]"
          >
            {error}
          </div>
        ) : null}

        {data ? (
          <div className="mt-8 space-y-8">
            {data.headline ? (
              <p className="text-[15px] font-semibold leading-snug text-[var(--color-ink)] sm:text-[16px]">
                {data.headline}
              </p>
            ) : null}

            <div className="grid gap-8 lg:grid-cols-[auto_1fr] lg:items-center lg:gap-12">
              <div className="flex flex-wrap justify-center gap-10 sm:justify-start">
                <ScoreRing
                  score={data.job_match_old}
                  label="Original resume"
                  sub="vs this posting"
                />
                <ScoreRing
                  score={data.job_match_new}
                  label="Tailored resume"
                  sub="vs this posting"
                />
              </div>
              <div className="space-y-5">
                <div className="flex flex-wrap items-end gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    Overall lift
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-[22px] font-bold tabular-nums leading-none ${liftTone}`}
                  >
                    {lift > 0 ? "+" : ""}
                    {lift}
                  </span>
                  <span className="text-[12px] text-[var(--color-muted)]">points on job match</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <AxisRow
                    title="Keywords & vocabulary"
                    oldScore={data.keywords_old}
                    newScore={data.keywords_new}
                  />
                  <AxisRow title="Role fit" oldScore={data.role_fit_old} newScore={data.role_fit_new} />
                  <AxisRow
                    title="Evidence & clarity"
                    oldScore={data.evidence_old}
                    newScore={data.evidence_new}
                  />
                </div>
              </div>
            </div>

            {data.summary ? (
              <p className="text-[14px] leading-relaxed text-[var(--color-muted)]">{data.summary}</p>
            ) : null}

            <div className="grid gap-5 sm:grid-cols-2">
              {data.what_improved.length > 0 ? (
                <div className="rounded-xl border border-emerald-300/40 bg-emerald-500/[0.06] px-4 py-3 dark:border-emerald-800/50 dark:bg-emerald-950/30">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-800 dark:text-emerald-300">
                    What improved
                  </p>
                  <ul className="mt-2 list-inside list-disc space-y-1.5 text-[13px] leading-snug text-[var(--color-ink)]">
                    {data.what_improved.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {data.still_watch.length > 0 ? (
                <div className="rounded-xl border border-amber-300/45 bg-amber-500/[0.06] px-4 py-3 dark:border-amber-800/50 dark:bg-amber-950/25">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-900 dark:text-amber-300">
                    Still watch
                  </p>
                  <ul className="mt-2 list-inside list-disc space-y-1.5 text-[13px] leading-snug text-[var(--color-ink)]">
                    {data.still_watch.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <p className="text-[10px] text-[var(--color-muted)]">
              Model: <code className="rounded bg-[var(--color-code-bg)] px-1 font-mono">{data.model}</code>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
