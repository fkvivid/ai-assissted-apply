import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  analyzeKeywordGaps,
  compilePdf,
  generateApplicationText,
  generateResume,
} from "../api";
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

type ExtraApplicationOutput = {
  id: string;
  label: string;
  prompt: string;
  text: string | null;
  loading: boolean;
  error: string | null;
};

export function HomePage() {
  const { settings } = useAppSettings();
  const [jobDescription, setJobDescription] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [pdfPreviewError, setPdfPreviewError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extraOutputs, setExtraOutputs] = useState<ExtraApplicationOutput[]>(
    [],
  );
  const [activeOutputTab, setActiveOutputTab] = useState<"resume" | string>(
    "resume",
  );
  const [copiedExtraId, setCopiedExtraId] = useState<string | null>(null);
  const [gapMissing, setGapMissing] = useState<string[]>([]);
  const [gapMatched, setGapMatched] = useState<string[]>([]);
  const [gapLoading, setGapLoading] = useState(false);
  const [gapError, setGapError] = useState<string | null>(null);
  const [customGapKeywords, setCustomGapKeywords] = useState<string[]>([]);
  const [selectedGapKeywords, setSelectedGapKeywords] = useState<string[]>([]);
  const [manualKeywordDraft, setManualKeywordDraft] = useState("");

  useEffect(() => {
    return () => {
      if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
    };
  }, [pdfObjectUrl]);

  useEffect(() => {
    setGapMissing([]);
    setGapMatched([]);
    setGapError(null);
    setCustomGapKeywords([]);
    setSelectedGapKeywords([]);
  }, [jobDescription]);

  const gapKeywordChips = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const k of [...gapMissing, ...customGapKeywords]) {
      const t = k.trim();
      if (!t) continue;
      const low = t.toLowerCase();
      if (seen.has(low)) continue;
      seen.add(low);
      out.push(t);
    }
    return out;
  }, [gapMissing, customGapKeywords]);

  const selectedKeywordSet = useMemo(
    () => new Set(selectedGapKeywords.map((k) => k.trim().toLowerCase())),
    [selectedGapKeywords],
  );

  const gapSelectedCount = gapKeywordChips.filter((k) =>
    selectedKeywordSet.has(k.toLowerCase()),
  ).length;

  const keywordBoostSection = useMemo(() => {
    const lines = selectedGapKeywords
      .map((k) => k.trim())
      .filter(Boolean)
      .map((k) => `- ${k}`);
    if (!lines.length) return "";
    return (
      "## Keywords to emphasize (candidate confirmed they can honestly claim these)\n" +
      lines.join("\n")
    );
  }, [selectedGapKeywords]);

  const effectiveAdditionalInstructions = useMemo(() => {
    const base = additionalInstructions.trim();
    const kw = keywordBoostSection.trim();
    if (base && kw) return `${base}\n\n${kw}`;
    return base || kw;
  }, [additionalInstructions, keywordBoostSection]);

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

  const handleAnalyzeGaps = useCallback(async () => {
    setGapError(null);
    if (!jobDescription.trim()) {
      setGapError("Paste a job description first.");
      return;
    }
    setGapLoading(true);
    try {
      const out = await analyzeKeywordGaps({
        job_description: jobDescription,
        resume: settings.resume,
      });
      setGapMissing(out.missing_keywords);
      setGapMatched(out.matched_keywords);
      setSelectedGapKeywords([]);
      setCustomGapKeywords([]);
    } catch (e) {
      setGapMissing([]);
      setGapMatched([]);
      setGapError(
        e instanceof Error ? e.message : "Keyword analysis failed.",
      );
    } finally {
      setGapLoading(false);
    }
  }, [jobDescription, settings.resume]);

  const toggleGapKeyword = useCallback((display: string) => {
    const low = display.trim().toLowerCase();
    setSelectedGapKeywords((prev) => {
      const has = prev.some((p) => p.trim().toLowerCase() === low);
      if (has) {
        return prev.filter((p) => p.trim().toLowerCase() !== low);
      }
      return [...prev, display.trim()];
    });
  }, []);

  const selectAllGapKeywords = useCallback(() => {
    setSelectedGapKeywords([...gapKeywordChips]);
  }, [gapKeywordChips]);

  const clearGapKeywordSelection = useCallback(() => {
    setSelectedGapKeywords([]);
  }, []);

  const addManualGapKeyword = useCallback(() => {
    const t = manualKeywordDraft.trim();
    if (!t) return;
    const low = t.toLowerCase();
    setCustomGapKeywords((prev) => {
      const combined = [...gapMissing, ...prev].map((p) =>
        p.trim().toLowerCase(),
      );
      if (combined.includes(low)) return prev;
      return [...prev, t];
    });
    setManualKeywordDraft("");
  }, [manualKeywordDraft, gapMissing]);

  const handleGenerate = useCallback(async () => {
    setError(null);
    if (!jobDescription.trim()) {
      setError("Paste a job description first.");
      return;
    }
    setLoading(true);
    setGenerated(null);
    setModel(null);
    setCopied(false);
    setCopiedExtraId(null);
    setExtraOutputs([]);
    setActiveOutputTab("resume");
    setPdfPreviewError(null);
    setPdfLoading(false);
    setPdfObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    try {
      const out = await generateResume({
        resume: settings.resume,
        job_description: jobDescription,
        template: settings.template,
        use_default_template: settings.useDefaultTemplate,
        ai_instructions: settings.aiInstructions,
        additional_instructions: effectiveAdditionalInstructions,
      });
      setGenerated(out.latex);
      setModel(out.model);
      await refreshPdfPreview(out.latex);
    } catch (e) {
      setGenerated(null);
      setModel(null);
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
    effectiveAdditionalInstructions,
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

  const addExtraOutput = useCallback(() => {
    const id = crypto.randomUUID();
    setExtraOutputs((prev) => [
      ...prev,
      {
        id,
        label: "Cover letter",
        prompt: "",
        text: null,
        loading: false,
        error: null,
      },
    ]);
    setActiveOutputTab(id);
  }, []);

  const removeExtraOutput = useCallback((id: string) => {
    setExtraOutputs((prev) => prev.filter((o) => o.id !== id));
    setActiveOutputTab((cur) => (cur === id ? "resume" : cur));
  }, []);

  const updateExtraOutput = useCallback(
    (id: string, patch: Partial<ExtraApplicationOutput>) => {
      setExtraOutputs((prev) =>
        prev.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      );
    },
    [],
  );

  const handleGenerateExtra = useCallback(
    async (id: string) => {
      const row = extraOutputs.find((o) => o.id === id);
      const prompt = row?.prompt ?? "";
      if (!jobDescription.trim()) {
        updateExtraOutput(id, {
          error: "Paste a job description first.",
        });
        return;
      }
      if (!prompt.trim()) {
        updateExtraOutput(id, {
          error: "Add your prompt or paste the employer’s question above.",
        });
        return;
      }
      updateExtraOutput(id, {
        loading: true,
        error: null,
        text: null,
      });
      try {
        const out = await generateApplicationText({
          resume: settings.resume,
          job_description: jobDescription,
          additional_instructions: effectiveAdditionalInstructions,
          task_prompt: prompt,
        });
        updateExtraOutput(id, {
          text: out.text,
          loading: false,
          error: null,
        });
      } catch (e) {
        updateExtraOutput(id, {
          loading: false,
          error: e instanceof Error ? e.message : "Something went wrong.",
        });
      }
    },
    [
      effectiveAdditionalInstructions,
      extraOutputs,
      jobDescription,
      settings.resume,
      updateExtraOutput,
    ],
  );

  const handleCopyExtra = useCallback(async (id: string, text: string) => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedExtraId(id);
      window.setTimeout(() => setCopiedExtraId(null), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }, []);

  const handleDownloadExtraTxt = useCallback(
    (label: string, text: string) => {
      if (!text.trim()) return;
      const stamp = new Date().toISOString().slice(0, 10);
      const safe = label
        .trim()
        .replace(/[/\\?%*:|"<>]/g, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 80);
      const name = safe ? `${safe}-${stamp}.txt` : `application-${stamp}.txt`;
      downloadText(name, text, "text/plain;charset=utf-8");
    },
    [],
  );

  const showOutputWorkspace =
    generated !== null || extraOutputs.length > 0;

  if (!settings.resume.trim()) {
    return (
      <Navigate to="/settings" replace state={{ requireResume: true }} />
    );
  }

  return (
    <main className="relative mx-auto w-full max-w-[96rem] flex-1 px-5 py-12 sm:px-8 lg:px-10 lg:py-16">
      <div
        className="ui-grid-bg pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-20"
        aria-hidden
      />

      <div className="relative grid gap-12 lg:grid-cols-[0.95fr_1.25fr] lg:gap-16 lg:items-start">
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

          <div className="mt-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/50 p-4 dark:bg-zinc-900/25">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                  Missing keywords
                  {gapKeywordChips.length > 0 ? (
                    <span className="ml-2 font-mono text-[11px] font-normal normal-case tracking-normal text-[var(--color-ink)]">
                      ({gapSelectedCount}/{gapKeywordChips.length} selected)
                    </span>
                  ) : null}
                </h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--color-muted)]">
                  Compare the posting to your saved resume, then tick only skills
                  or terms you honestly have. Selected items are added to this
                  job&apos;s instructions when you generate.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleAnalyzeGaps()}
                disabled={gapLoading || !jobDescription.trim()}
                className="shrink-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-[12px] font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-border)]/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600"
              >
                {gapLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block size-4 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-indigo-600 dark:border-t-indigo-400"
                      aria-hidden
                    />
                    Analyzing…
                  </span>
                ) : (
                  "Find missing keywords"
                )}
              </button>
            </div>

            {gapError ? (
              <div
                role="alert"
                className="mt-3 rounded-lg border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-[12px] text-[var(--color-danger-text)]"
              >
                {gapError}
              </div>
            ) : null}

            {gapMatched.length > 0 ? (
              <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-muted)]">
                <span className="font-semibold text-[var(--color-ink)]">
                  Already on your resume:
                </span>{" "}
                {gapMatched.join(", ")}
              </p>
            ) : null}

            {!gapLoading &&
            gapMissing.length === 0 &&
            gapMatched.length > 0 &&
            !gapError ? (
              <p className="mt-3 text-[12px] font-medium text-emerald-700 dark:text-emerald-400">
                No obvious missing keywords—the posting lines up with what&apos;s
                already in your resume. You can still add terms below.
              </p>
            ) : null}

            {gapKeywordChips.length > 0 ? (
              <div className="mt-4">
                <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={selectAllGapKeywords}
                    className="text-[12px] font-semibold text-[var(--color-primary)] hover:underline"
                  >
                    Select all
                  </button>
                  <span className="text-[var(--color-border)]">·</span>
                  <button
                    type="button"
                    onClick={clearGapKeywordSelection}
                    className="text-[12px] font-semibold text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                  >
                    Clear
                  </button>
                </div>
                <ul className="flex flex-wrap gap-2" aria-label="Suggested keywords">
                  {gapKeywordChips.map((kw, idx) => {
                    const checked = selectedKeywordSet.has(kw.toLowerCase());
                    const id = `gap-kw-${idx}`;
                    return (
                      <li key={`${kw}-${idx}`}>
                        <label
                          htmlFor={id}
                          className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition ${
                            checked
                              ? "border-indigo-400 bg-indigo-500/10 text-[var(--color-ink)] dark:border-indigo-500"
                              : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:border-[var(--color-border)] dark:bg-zinc-900/40"
                          }`}
                        >
                          <input
                            id={id}
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleGapKeyword(kw)}
                            className="size-3.5 rounded border-[var(--color-border)] text-indigo-600 focus:ring-indigo-500/30"
                          />
                          {kw}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-[var(--color-border)]/60 pt-4">
              <div className="min-w-[12rem] flex-1">
                <label
                  htmlFor="manual-gap-keyword"
                  className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]"
                >
                  Add keyword
                </label>
                <input
                  id="manual-gap-keyword"
                  type="text"
                  value={manualKeywordDraft}
                  onChange={(e) => setManualKeywordDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addManualGapKeyword();
                    }
                  }}
                  placeholder="e.g. Django, HIPAA, SOC 2…"
                  className="mt-1.5 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-[13px] text-[var(--color-ink)] placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600"
                />
              </div>
              <button
                type="button"
                onClick={addManualGapKeyword}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[12px] font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-border)]/35 dark:border-zinc-600"
              >
                Add
              </button>
            </div>
          </div>

          <details className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/40 dark:bg-zinc-900/30">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[13px] font-semibold text-[var(--color-ink)] marker:content-none [&::-webkit-details-marker]:hidden">
              <span>Extra instructions</span>
              <span className="text-[11px] font-normal text-[var(--color-muted)]">
                Optional · click to expand or collapse
              </span>
            </summary>
            <div className="border-t border-[var(--color-border)] px-3 pb-3 pt-2">
              <label htmlFor="extra-instructions" className="sr-only">
                Extra instructions for this job
              </label>
              <p className="text-[12px] leading-relaxed text-[var(--color-muted)]">
                Add one-off guidance for this posting only — e.g. define an abbreviation, stress a theme, or set priorities. Short notes or bullets are fine.
              </p>
              <textarea
                id="extra-instructions"
                value={additionalInstructions}
                onChange={(e) => setAdditionalInstructions(e.target.value)}
                placeholder="Optional: clarifications, emphasis, or constraints for this role…"
                rows={3}
                className="mt-2 min-h-[84px] w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--color-ink)] shadow-inner placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600 dark:placeholder:text-zinc-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-400/25"
                spellCheck
              />
            </div>
          </details>

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

      {showOutputWorkspace ? (
        <section
          className={`relative mt-14 ${cardClass} shadow-[var(--shadow-elevated)]`}
        >
          <h2 className="text-[16px] font-semibold text-[var(--color-ink)]">
            Output workspace
          </h2>
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">
            Use the Resume tab for LaTeX and PDF. Add outputs for cover letters,
            “why this company,” team intros, or any pasted employer prompt—each
            tab has its own prompt and generated text.
          </p>

          <div
            className="mt-5 flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] pb-3"
            role="tablist"
            aria-label="Output type"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeOutputTab === "resume"}
              onClick={() => setActiveOutputTab("resume")}
              className={`rounded-lg px-3.5 py-2 text-[12px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                activeOutputTab === "resume"
                  ? "bg-[var(--color-primary)] text-white shadow-md shadow-indigo-500/20"
                  : "border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-ink)] hover:bg-[var(--color-border)]/35"
              }`}
            >
              Resume
            </button>
            {extraOutputs.map((o) => (
              <button
                key={o.id}
                type="button"
                role="tab"
                aria-selected={activeOutputTab === o.id}
                onClick={() => setActiveOutputTab(o.id)}
                className={`max-w-[14rem] truncate rounded-lg px-3.5 py-2 text-[12px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                  activeOutputTab === o.id
                    ? "bg-[var(--color-primary)] text-white shadow-md shadow-indigo-500/20"
                    : "border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-ink)] hover:bg-[var(--color-border)]/35"
                }`}
              >
                {o.label.trim() || "Untitled"}
              </button>
            ))}
            <button
              type="button"
              onClick={addExtraOutput}
              className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2 text-[12px] font-semibold text-[var(--color-primary)] transition hover:border-[var(--color-primary)]/50 hover:bg-indigo-500/5"
            >
              + Add output
            </button>
          </div>

          {activeOutputTab === "resume" ? (
            <div className="mt-6 grid min-h-[min(620px,75vh)] gap-4 lg:grid-cols-2 lg:gap-6">
              <div className="flex min-h-[280px] flex-col lg:min-h-0">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--color-muted)]">
                    LaTeX source
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleCopyLatex}
                      disabled={!generated?.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-border)]/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CopyIcon />
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadTex}
                      disabled={!generated?.trim()}
                      className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-muted)] transition hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      .tex
                    </button>
                  </div>
                </div>
                <textarea
                  value={generated ?? ""}
                  onChange={(e) => setGenerated(e.target.value)}
                  spellCheck={false}
                  placeholder={
                    generated === null
                      ? "Run “Craft refined resume” above to fill this, or paste LaTeX."
                      : undefined
                  }
                  className="min-h-[280px] flex-1 resize-y rounded-xl border border-[var(--color-border)] bg-[var(--color-preview-bg)] p-3.5 font-mono text-[12px] leading-relaxed text-[var(--color-preview-text)] placeholder:text-zinc-500 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 lg:min-h-[520px] dark:placeholder:text-zinc-500"
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
                      onClick={() =>
                        void refreshPdfPreview(generated ?? "")
                      }
                      disabled={pdfLoading || !(generated ?? "").trim()}
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
                      disabled={pdfLoading || !(generated ?? "").trim()}
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
                      className="min-h-[320px] w-full flex-1 rounded-b-[10px] border-0 bg-white lg:min-h-0"
                    />
                  ) : (
                    <div className="flex flex-1 items-center justify-center p-6 text-center text-[13px] text-[var(--color-muted)]">
                      {pdfLoading
                        ? ""
                        : !(generated ?? "").trim()
                          ? "Generate or paste LaTeX, then render."
                          : "Click “Render preview” after generating or editing."}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            (() => {
              const row = extraOutputs.find((o) => o.id === activeOutputTab);
              if (!row) {
                return (
                  <p className="mt-6 text-[13px] text-[var(--color-muted)]">
                    This output was removed. Choose another tab.
                  </p>
                );
              }
              return (
                <div className="mt-6 grid min-h-[min(480px,70vh)] gap-4 lg:grid-cols-2 lg:gap-6">
                  <div className="flex min-h-[240px] flex-col">
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <label
                          htmlFor={`extra-label-${row.id}`}
                          className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--color-muted)]"
                        >
                          Tab name
                        </label>
                        <input
                          id={`extra-label-${row.id}`}
                          type="text"
                          value={row.label}
                          onChange={(e) =>
                            updateExtraOutput(row.id, {
                              label: e.target.value,
                            })
                          }
                          className="mt-1.5 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-[14px] text-[var(--color-ink)] focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600"
                          placeholder="Cover letter"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeExtraOutput(row.id)}
                        className="shrink-0 rounded-lg border border-[var(--color-border)] px-3 py-2 text-[11px] font-semibold text-[var(--color-muted)] transition hover:border-red-300 hover:text-red-700 dark:hover:border-red-800 dark:hover:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                    <label
                      htmlFor={`extra-prompt-${row.id}`}
                      className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--color-muted)]"
                    >
                      Prompt / employer question
                    </label>
                    <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-muted)]">
                      Describe what you need (cover letter angle) or paste the
                      exact question—e.g. why this company, or a team intro box.
                    </p>
                    <textarea
                      id={`extra-prompt-${row.id}`}
                      value={row.prompt}
                      onChange={(e) =>
                        updateExtraOutput(row.id, { prompt: e.target.value })
                      }
                      rows={10}
                      placeholder='Example: "What interests you about working for this company?" or paste the full Helium intro prompt…'
                      className="mt-2 min-h-[200px] flex-1 resize-y rounded-xl border border-[var(--color-border)] bg-[var(--color-input)] px-3.5 py-3 text-[14px] leading-relaxed text-[var(--color-ink)] shadow-inner placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600 dark:placeholder:text-zinc-500 lg:min-h-[280px]"
                      spellCheck
                    />
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void handleGenerateExtra(row.id)}
                        disabled={row.loading}
                        className="inline-flex min-w-[160px] items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-[var(--color-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {row.loading ? (
                          <>
                            <ButtonSpinner />
                            Generating…
                          </>
                        ) : (
                          <>
                            <SparkleIcon />
                            Generate text
                          </>
                        )}
                      </button>
                    </div>
                    {row.error ? (
                      <div
                        role="alert"
                        className="mt-3 rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-[12px] font-medium text-[var(--color-danger-text)]"
                      >
                        {row.error}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex min-h-[240px] flex-col border-t border-[var(--color-border)] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--color-muted)]">
                        Generated text
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopyExtra(row.id, row.text ?? "")
                          }
                          disabled={!row.text?.trim()}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-border)]/40 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <CopyIcon />
                          {copiedExtraId === row.id ? "Copied" : "Copy"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleDownloadExtraTxt(row.label, row.text ?? "")
                          }
                          disabled={!row.text?.trim()}
                          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-muted)] transition hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          .txt
                        </button>
                      </div>
                    </div>
                    <textarea
                      readOnly
                      value={row.text ?? ""}
                      placeholder="Generated copy appears here after you click Generate text."
                      className="min-h-[260px] flex-1 resize-y rounded-xl border border-[var(--color-border)] bg-[var(--color-preview-bg)] p-3.5 text-[14px] leading-relaxed text-[var(--color-preview-text)] placeholder:text-zinc-500 lg:min-h-[320px] dark:placeholder:text-zinc-600"
                    />
                  </div>
                </div>
              );
            })()
          )}
        </section>
      ) : null}
    </main>
  );
}
