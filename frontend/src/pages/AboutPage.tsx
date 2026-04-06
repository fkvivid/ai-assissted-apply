import { Link } from "react-router-dom";

const cardClass =
  "rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8 shadow-[var(--shadow-card)] dark:border-zinc-700/80";

export function AboutPage() {
  return (
    <main className="relative mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8 lg:py-16">
      <div
        className="ui-grid-bg pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-20"
        aria-hidden
      />

      <div className="relative mx-auto max-w-2xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-muted)]">
          About
        </p>
        <h1 className="mt-3 text-[2rem] font-semibold leading-[1.15] tracking-tight text-[var(--color-ink)] sm:text-4xl">
          Why I built this
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-[var(--color-muted)]">
          A short note on motivation — not a pitch.
        </p>

        <article className={`${cardClass} mt-10 space-y-6 text-[15px] leading-relaxed text-[var(--color-ink)]`}>
          <p className="text-[var(--color-muted)]">
            Applying for jobs was harder than it should have been: it took a lot of
            time, and the same tasks came up again and again. I kept wishing the
            process were lighter.
          </p>
          <p className="text-[var(--color-muted)]">
            Later I started using AI as part of my workflow and noticed a pattern:
            it helped, but I was still doing a lot of manual copy and paste between
            chats, documents, and application forms. The friction did not go away.
          </p>
          <p className="text-[var(--color-muted)]">
            I built AI Assisted Apply to reduce that friction — something simple,
            without extra complexity, so tailoring a resume to a specific role takes
            minimal effort. The goal is a straight path from job description to a
            clean, structured document you can review and use.
          </p>
          <p className="border-t border-[var(--color-border)] pt-6 text-[var(--color-ink)]">
            This is not meant to help anyone cheat or misrepresent themselves. It is
            about presenting your real experience and capacity as clearly as
            possible, so employers can see what you actually bring — nothing more,
            nothing less.
          </p>
        </article>

        <p className="mt-10 text-center text-[13px] text-[var(--color-muted)]">
          <Link
            to="/"
            className="font-semibold text-[var(--color-primary)] transition hover:underline"
          >
            Back to Home
          </Link>
        </p>
      </div>
    </main>
  );
}
