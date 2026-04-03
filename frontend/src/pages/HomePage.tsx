import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { compilePdf, generateResume } from "../api";
import { useAppSettings } from "../useAppSettings";

const PLACEHOLDER_JOB =
  "Paste the target job description here…\n\nInclude responsibilities, requirements, and keywords so the tailored resume can align with the role.";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadText(filename: string, content: string, mime: string) {
  downloadBlob(new Blob([content], { type: mime }), filename);
}

/** Safe segment for {name}_resume.pdf; empty → use plain resume.pdf */
function pdfDownloadFilename(userName: string): string {
  const raw = userName.trim();
  if (!raw) return "resume.pdf";
  const safe = raw
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 120);
  if (!safe) return "resume.pdf";
  return `${safe}_resume.pdf`;
}

function SparkleIcon() {
  return (
    <svg
      className="size-[18px]"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 2l1.09 4.26L17 7l-3.91 0.74L12 12l-1.09-4.26L7 7l3.91-0.74L12 2zM5 14l0.84 3.16L9 18l-3.16 0.84L5 22l-0.84-3.16L1 18l3.16-0.84L5 14zM19 14l0.84 3.16L23 18l-3.16 0.84L19 22l-0.84-3.16L15 18l3.16-0.84L19 14z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      className="size-[18px]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      className="size-[16px]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function ButtonSpinner({ className }: { className?: string }) {
  return (
    <span
      className={`inline-block size-4 animate-spin rounded-full border-2 border-white/30 border-t-white ${className ?? ""}`}
      aria-hidden
    />
  );
}

const cardClass =
  "rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8 shadow-[var(--shadow-card)] dark:border-zinc-700/80";

export function HomePage() {
  const { settings } = useAppSettings();
  const [jobDescription, setJobDescription] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [matchPercent, setMatchPercent] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [pdfPreviewError, setPdfPreviewError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
    };
  }, [pdfObjectUrl]);

  const refreshPdfPreview = useCallback(async (tex: string) => {
    const t = tex.trim();
    if (!t) {
      setPdfObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPdfPreviewError(null);
      return;
    }
    setPdfLoading(true);
    setPdfPreviewError(null);
    try {
      const blob = await compilePdf(t);
      setPdfObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (e) {
      setPdfObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPdfPreviewError(
        e instanceof Error ? e.message : "Could not build PDF preview.",
      );
    } finally {
      setPdfLoading(false);
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    setError(null);
    if (!jobDescription.trim()) {
      setError("Paste a job description first.");
      return;
    }
    setLoading(true);
    setMatchPercent(null);
    try {
      const out = await generateResume({
        resume: settings.resume,
        job_description: jobDescription,
        template: settings.template,
        use_default_template: settings.useDefaultTemplate,
        ai_instructions: settings.aiInstructions,
      });
      setGenerated(out.latex);
      setModel(out.model);
      setMatchPercent(
        typeof out.match_percent === "number" &&
          out.match_percent >= 0 &&
          out.match_percent <= 100
          ? out.match_percent
          : null,
      );
      await refreshPdfPreview(out.latex);
    } catch (e) {
      setGenerated(null);
      setModel(null);
      setMatchPercent(null);
      setPdfObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPdfPreviewError(null);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [
    jobDescription,
    settings.resume,
    settings.template,
    settings.useDefaultTemplate,
    settings.aiInstructions,
    refreshPdfPreview,
  ]);

  const handleDownloadTex = useCallback(() => {
    if (!generated?.trim()) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`resume-tailored-${stamp}.tex`, generated, "text/plain");
  }, [generated]);

  const handleDownloadPdf = useCallback(async () => {
    if (!generated?.trim()) return;
    setPdfLoading(true);
    setPdfPreviewError(null);
    try {
      const blob = await compilePdf(generated);
      downloadBlob(blob, pdfDownloadFilename(settings.userName));
      setPdfObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (e) {
      setPdfPreviewError(
        e instanceof Error ? e.message : "Could not build PDF for download.",
      );
    } finally {
      setPdfLoading(false);
    }
  }, [generated, settings.userName]);

  const handleCopyLatex = useCallback(async () => {
    if (!generated?.trim()) return;
    try {
      await navigator.clipboard.writeText(generated);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }, [generated]);

  if (!settings.resume.trim()) {
    return (
      <Navigate to="/settings" replace state={{ requireResume: true }} />
    );
  }

  return (
    <main className="relative mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8 lg:py-16">
      <div
        className="ui-grid-bg pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-20"
        aria-hidden
      />

      <div className="relative grid gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:items-start">
        <div className="space-y-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-muted)]">
            Resume studio
          </p>
          <h1 className="text-[2rem] font-semibold leading-[1.15] tracking-tight text-[var(--color-ink)] sm:text-4xl lg:text-[2.75rem]">
            Refine your{" "}
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text font-semibold text-transparent dark:from-indigo-400 dark:to-violet-400">
              narrative.
            </span>
          </h1>
          <p className="max-w-md text-[15px] leading-relaxed text-[var(--color-muted)]">
            Paste the role&apos;s posting and generate LaTeX that mirrors your
            saved profile — structured, honest, and aligned with the job.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <span className="inline-flex items-center rounded-full bg-[var(--color-badge-1-bg)] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-badge-1-text)]">
              AI-assisted
            </span>
            <span className="inline-flex items-center rounded-full border border-[var(--color-badge-2-ring)] bg-[var(--color-badge-2-bg)] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-badge-2-text)]">
              Open source
            </span>
          </div>
          <Link
            to="/settings"
            className="group inline-flex items-center gap-2 text-[14px] font-semibold text-[var(--color-primary)] transition hover:gap-3"
          >
            <svg
              className="size-4 opacity-80"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Edit resume &amp; template
            <span aria-hidden className="transition group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>

        <div
          className={`relative ${cardClass} overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-indigo-300/50 before:to-transparent dark:before:via-indigo-500/30`}
        >
          <div className="mb-5">
            <label
              htmlFor="job-desc"
              className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-muted)]"
            >
              Job description
            </label>
            <p className="mt-1.5 text-[13px] font-medium text-[var(--color-muted)]">
              Target role — paste the full posting.
            </p>
          </div>
          <textarea
            id="job-desc"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder={PLACEHOLDER_JOB}
            rows={11}
            className="max-h-[min(38vh,20rem)] min-h-[12rem] w-full resize-y overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-input)] px-4 py-3 text-[14px] leading-relaxed text-[var(--color-ink)] shadow-inner placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600 dark:placeholder:text-zinc-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-400/25"
            spellCheck
          />
          {jobDescription.trim() ? (
            <p className="mt-2 text-right text-[11px] tabular-nums text-[var(--color-muted)]">
              {jobDescription.trim().split(/\s+/).length} words
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--color-border)]/80 pt-6">
            {model ? (
              <span className="mr-auto hidden text-[11px] text-[var(--color-muted)] sm:inline">
                {model}
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="inline-flex min-w-[200px] items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-6 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-[var(--color-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-70 dark:shadow-indigo-900/40"
            >
              {loading ? (
                <>
                  <ButtonSpinner />
                  Crafting your resume…
                </>
              ) : (
                <>
                  <SparkleIcon />
                  Craft refined resume
                </>
              )}
            </button>
          </div>

          {error ? (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-3 text-[13px] font-medium text-[var(--color-danger-text)]"
            >
              {error}
            </div>
          ) : null}

          <p className="mt-5 text-[11px] leading-relaxed text-[var(--color-muted)]">
            Server:{" "}
            <code className="rounded-md bg-[var(--color-code-bg)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-ink)]">
              OPENAI_API_KEY
            </code>
            . PDF preview needs LaTeX on the API (included in Docker). Details: README.
          </p>
        </div>
      </div>

      {generated !== null ? (
        <section
          className={`relative mt-14 ${cardClass} shadow-[var(--shadow-elevated)]`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[16px] font-semibold text-[var(--color-ink)]">
              Output workspace
            </h2>
            {matchPercent !== null ? (
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold tabular-nums ${
                  matchPercent >= 80
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200"
                    : matchPercent >= 50
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-100"
                      : "border-orange-500/35 bg-orange-500/10 text-orange-950 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-100"
                }`}
                title="Model estimate: how well this tailored resume aligns with the pasted job description"
              >
                Job match · {matchPercent}%
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">
            Edit the LaTeX on the left, then render the PDF on the right. Download
            the PDF when you are happy with the preview. The job match badge reflects
            the last generation versus the job description you pasted above.
          </p>

          <div className="mt-6 grid min-h-[min(520px,65vh)] gap-4 lg:grid-cols-2 lg:gap-6">
            <div className="flex min-h-[280px] flex-col lg:min-h-0">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--color-muted)]">
                  LaTeX source
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCopyLatex}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-border)]/40"
                  >
                    <CopyIcon />
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadTex}
                    className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
                  >
                    .tex
                  </button>
                </div>
              </div>
              <textarea
                value={generated}
                onChange={(e) => setGenerated(e.target.value)}
                spellCheck={false}
                className="min-h-[240px] flex-1 resize-y rounded-xl border border-[var(--color-border)] bg-[var(--color-preview-bg)] p-3 font-mono text-[11px] leading-relaxed text-[var(--color-preview-text)] focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 lg:min-h-[420px]"
              />
            </div>

            <div className="flex min-h-[280px] flex-col border-t border-[var(--color-border)] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--color-muted)]">
                  PDF preview
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void refreshPdfPreview(generated)}
                    disabled={pdfLoading || !generated.trim()}
                    className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-border)]/40 disabled:opacity-50"
                  >
                    {pdfLoading ? (
                      <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-zinc-400 border-t-indigo-600" />
                    ) : null}
                    Render preview
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownloadPdf()}
                    disabled={pdfLoading || !generated.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-ink)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-surface)] transition hover:opacity-90 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    <DownloadIcon />
                    Download PDF
                  </button>
                </div>
              </div>

              <div className="relative flex min-h-[220px] flex-1 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-zinc-100 dark:bg-zinc-950">
                {pdfLoading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[2px] dark:bg-zinc-950/70">
                    <span className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--color-muted)]">
                      <span className="size-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                      Rendering PDF…
                    </span>
                  </div>
                )}
                {pdfPreviewError && !pdfLoading ? (
                  <div className="flex flex-1 flex-col overflow-auto p-4">
                    <p className="text-[12px] font-semibold text-red-700 dark:text-red-300">
                      PDF could not be built
                    </p>
                    <pre className="mt-2 max-h-[320px] overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[var(--color-muted)]">
                      {pdfPreviewError}
                    </pre>
                  </div>
                ) : pdfObjectUrl ? (
                  <iframe
                    title="PDF preview"
                    src={pdfObjectUrl}
                    className="min-h-[280px] w-full flex-1 rounded-b-[10px] border-0 bg-white lg:min-h-0"
                  />
                ) : (
                  <div className="flex flex-1 items-center justify-center p-6 text-center text-[13px] text-[var(--color-muted)]">
                    {pdfLoading
                      ? ""
                      : "Click “Render preview” after generating or editing."}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
