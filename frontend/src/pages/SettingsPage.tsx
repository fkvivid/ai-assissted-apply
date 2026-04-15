import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  DEFAULT_AI_INSTRUCTIONS,
  type AppSettings,
} from "../settingsStorage";
import { ThemeToggle } from "../components/ThemeToggle";
import { Toast } from "../components/Toast";
import { useAppSettings } from "../useAppSettings";

const PLACEHOLDER_RESUME =
  "Paste your raw resume content here…\n\nThis is the only source the model should use for employers, dates, and accomplishments.";

const BUILT_IN_TEMPLATE_ID = "DEFAULT_CHARTER_US";

const cardClass =
  "rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8 shadow-[var(--shadow-card)] dark:border-zinc-700/80";

export function SettingsPage() {
  const { settings, setSettings, resetSettings } = useAppSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [toast, setToast] = useState<string | null>(null);

  const dismissToast = useCallback(() => setToast(null), []);

  const requireResume = Boolean(
    (location.state as { requireResume?: boolean } | null)?.requireResume,
  );

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const updateDraft = useCallback((patch: Partial<AppSettings>) => {
    setToast(null);
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  const hasSavedResume = settings.resume.trim().length > 0;

  const handleSave = useCallback(() => {
    setSettings(draft);
    navigate("/settings", { replace: true, state: {} });
  }, [draft, setSettings, navigate]);

  const handleSaveAndHome = useCallback(() => {
    if (!draft.resume.trim()) {
      setToast("Please add your original resume first.");
      return;
    }
    setSettings(draft);
    navigate("/");
  }, [draft, setSettings, navigate]);

  const handleReset = useCallback(() => {
    const next = resetSettings();
    setDraft(next);
  }, [resetSettings]);

  return (
    <main className="relative mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-8">
      <Toast message={toast} variant="error" onDismiss={dismissToast} />

      {hasSavedResume ? (
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--color-muted)] transition hover:text-[var(--color-primary)]"
        >
          ← Back to Home
        </Link>
      ) : (
        <p className="text-[13px] font-semibold text-[var(--color-muted)]">
          ← Home unlocks after you save your resume below
        </p>
      )}

      <div
        role="region"
        aria-label="Resume required"
        className="mt-8 rounded-[1.25rem] border border-[var(--color-warn-border)] bg-[var(--color-warn-bg)] px-6 py-5 shadow-[var(--shadow-card)]"
      >
        <p className="text-[15px] font-semibold text-[var(--color-warn-text)]">
          Configure your original resume first
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-warn-text)] opacity-95">
          {requireResume
            ? "You were sent here because your profile is not ready. Paste your resume and save — then you can use Home."
            : "Your resume is the source of truth for employers, dates, and wins. Add it below before using the rest of the app."}
        </p>
      </div>

      <div className="mt-10 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-3xl">
          Configuration
        </h1>
        <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
          Profile
        </span>
      </div>
      <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[var(--color-muted)]">
        Source material and preferences persist in this browser. The home flow
        only asks for a job description.
      </p>

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,10rem)_1fr] lg:gap-14">
        <div className="hidden lg:block">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-muted)]">
            Source
          </p>
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-muted)]">
            What the model may cite — never invent beyond this.
          </p>
        </div>
        <section className={cardClass}>
          <h2 className="text-[16px] font-semibold text-[var(--color-ink)]">
            Original resume
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-muted)]">
            Paste your current resume text.
          </p>
          <textarea
            value={draft.resume}
            onChange={(e) => updateDraft({ resume: e.target.value })}
            placeholder={PLACEHOLDER_RESUME}
            rows={12}
            className="mt-5 w-full resize-y rounded-2xl border border-[var(--color-border)] bg-[var(--color-input)] px-4 py-3 text-[14px] leading-relaxed text-[var(--color-ink)] placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600 dark:placeholder:text-zinc-500"
            spellCheck
          />
          <div className="mt-8 border-t border-[var(--color-border)]/70 pt-6">
            <label
              htmlFor="profile-name"
              className="block text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-muted)]"
            >
              PDF download name
            </label>
            <p className="mt-1.5 max-w-xl text-[12px] leading-relaxed text-[var(--color-muted)]">
              Optional. Used for the file when you download a PDF from Home (e.g.{" "}
              <span className="font-mono text-[11px] text-[var(--color-ink)]">
                Jane_Smith_resume.pdf
              </span>
              ). Spaces become underscores; leave blank for{" "}
              <span className="font-mono text-[11px] text-[var(--color-ink)]">
                resume.pdf
              </span>
              .
            </p>
            <input
              id="profile-name"
              type="text"
              value={draft.userName}
              onChange={(e) => updateDraft({ userName: e.target.value })}
              placeholder="Jane Smith"
              autoComplete="name"
              className="mt-3 w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-input)] px-4 py-2.5 text-[14px] text-[var(--color-ink)] placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600 dark:placeholder:text-zinc-500"
            />
          </div>
        </section>

        <div className="hidden lg:block">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-muted)]">
            Template
          </p>
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-muted)]">
            LaTeX structure for PDF output.
          </p>
        </div>
        <section className={cardClass}>
          <h2 className="text-[16px] font-semibold text-[var(--color-ink)]">
            LaTeX template
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-muted)]">
            Built-in Charter layout or your own full template.
          </p>

          <div className="mt-5">
            <label
              htmlFor="template-id"
              className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-muted)]"
            >
              Template ID
            </label>
            <input
              id="template-id"
              type="text"
              readOnly
              value={
                draft.useDefaultTemplate ? BUILT_IN_TEMPLATE_ID : "CUSTOM_PASTE"
              }
              className="mt-2 w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2.5 font-mono text-[13px] font-medium text-[var(--color-ink)]"
            />
            <p className="mt-2 text-[12px] text-[var(--color-muted)]">
              Built-in:{" "}
              <code className="rounded-md bg-[var(--color-code-bg)] px-1.5 font-mono text-[11px]">
                {BUILT_IN_TEMPLATE_ID}
              </code>
            </p>
          </div>

          <label className="mt-6 flex cursor-pointer items-center gap-3 text-[13px] font-semibold text-[var(--color-ink)]">
            <input
              type="checkbox"
              checked={draft.useDefaultTemplate}
              onChange={(e) =>
                updateDraft({ useDefaultTemplate: e.target.checked })
              }
              className="size-4 rounded border-[var(--color-border-strong)] text-indigo-600 focus:ring-indigo-500/30 dark:text-indigo-500"
            />
            Use default template (server Charter layout)
          </label>

          {!draft.useDefaultTemplate ? (
            <textarea
              value={draft.template}
              onChange={(e) => updateDraft({ template: e.target.value })}
              placeholder="% Paste your full LaTeX template here…"
              rows={12}
              className="mt-4 w-full resize-y rounded-2xl border border-[var(--color-border)] bg-[var(--color-input)] px-4 py-3 font-mono text-[12px] leading-relaxed text-[var(--color-ink)] placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600"
              spellCheck={false}
            />
          ) : null}
        </section>

        <div className="hidden lg:block">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-muted)]">
            AI
          </p>
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-muted)]">
            Rules sent with every generation.
          </p>
        </div>
        <section className={cardClass}>
          <h2 className="text-[16px] font-semibold text-[var(--color-ink)]">
            AI instructions
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-muted)]">
            Tone, constraints, and emphasis.
          </p>
          <textarea
            value={draft.aiInstructions}
            onChange={(e) => updateDraft({ aiInstructions: e.target.value })}
            placeholder="e.g. Assertive tone, emphasize metrics…"
            rows={8}
            className="mt-5 w-full resize-y rounded-2xl border border-[var(--color-border)] bg-[var(--color-input)] px-4 py-3 text-[14px] leading-relaxed text-[var(--color-ink)] placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600"
            spellCheck
          />
          <button
            type="button"
            onClick={() =>
              updateDraft({ aiInstructions: DEFAULT_AI_INSTRUCTIONS })
            }
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
          >
            Reset to defaults
          </button>
        </section>

        <div className="hidden lg:block">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-muted)]">
            Display
          </p>
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-muted)]">
            Theme preference.
          </p>
        </div>
        <section
          className={`${cardClass} bg-[var(--color-surface-elevated)]/50 dark:bg-zinc-900/40`}
          aria-labelledby="appearance-heading"
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2
                id="appearance-heading"
                className="text-[16px] font-semibold text-[var(--color-ink)]"
              >
                Appearance
              </h2>
              <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-[var(--color-muted)]">
                System follows your OS. Pin Light or Dark here.
              </p>
            </div>
            <ThemeToggle />
          </div>
        </section>

        <div className="hidden lg:block">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-muted)]">
            Journal
          </p>
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-muted)]">
            Save prompt after generation.
          </p>
        </div>
        <section className={cardClass}>
          <h2 className="text-[16px] font-semibold text-[var(--color-ink)]">
            Apply journal
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-muted)]">
            Ask before saving a generated resume to MongoDB history.
          </p>
          <label className="mt-5 flex cursor-pointer items-center gap-3 text-[13px] font-semibold text-[var(--color-ink)]">
            <input
              type="checkbox"
              checked={draft.askToSaveJournalAfterGenerate}
              onChange={(e) =>
                updateDraft({
                  askToSaveJournalAfterGenerate: e.target.checked,
                })
              }
              className="size-4 rounded border-[var(--color-border-strong)] text-indigo-600 focus:ring-indigo-500/30 dark:text-indigo-500"
            />
            Ask to save entry after generating a resume
          </label>
        </section>
      </div>

      <div className="mt-12 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--color-border)] pt-10">
        <button
          type="button"
          onClick={handleReset}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-2.5 text-[13px] font-semibold text-[var(--color-ink)] shadow-sm transition hover:bg-[var(--color-surface-elevated)]"
        >
          Reset defaults
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-5 py-2.5 text-[13px] font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-border)]/40"
        >
          Save
        </button>
        <button
          type="button"
          onClick={handleSaveAndHome}
          className="rounded-xl bg-[var(--color-primary)] px-7 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-[var(--color-primary-hover)] dark:shadow-indigo-900/30"
        >
          Save and go to Home →
        </button>
      </div>
    </main>
  );
}
