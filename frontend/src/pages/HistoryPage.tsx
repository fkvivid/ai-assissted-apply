import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteApplyJournal,
  listApplyJournal,
  type ApplyJournalEntry,
  updateApplyJournal,
} from "../api";

type DraftEntry = Omit<ApplyJournalEntry, "created_at" | "updated_at">;
type JournalStatus = ApplyJournalEntry["status"];
const JOURNAL_STATUS_OPTIONS: Array<{ value: JournalStatus; label: string }> = [
  { value: "applied", label: "Applied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "rejected", label: "Rejected" },
  { value: "ghosted", label: "Ghosted" },
  { value: "offer", label: "Offer" },
  { value: "withdrawn", label: "Withdrawn" },
];

const inputClass =
  "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-[13px] text-[var(--color-ink)] focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600";

const STATUS_BADGE_CLASS: Record<JournalStatus, string> = {
  applied:
    "border-emerald-300 bg-emerald-500/10 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300",
  interviewing:
    "border-sky-300 bg-sky-500/10 text-sky-700 dark:border-sky-700 dark:text-sky-300",
  rejected:
    "border-rose-300 bg-rose-500/10 text-rose-700 dark:border-rose-700 dark:text-rose-300",
  ghosted:
    "border-zinc-300 bg-zinc-500/10 text-zinc-700 dark:border-zinc-600 dark:text-zinc-300",
  offer:
    "border-violet-300 bg-violet-500/10 text-violet-700 dark:border-violet-700 dark:text-violet-300",
  withdrawn:
    "border-amber-300 bg-amber-500/10 text-amber-700 dark:border-amber-700 dark:text-amber-300",
};

export function HistoryPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<ApplyJournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePromptOpen, setDeletePromptOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<JournalStatus[]>([]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listApplyJournal();
      setEntries(data);
      if (!selectedId && data.length > 0) {
        setSelectedId(data[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load history.");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  );

  const filteredEntries = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return entries.filter((entry) => {
      const statusOk =
        statusFilter.length === 0 || statusFilter.includes(entry.status);
      if (!statusOk) return false;
      if (!q) return true;
      const hay = [
        entry.company_name,
        entry.position,
        entry.location,
        entry.job_source,
        entry.link,
        entry.date,
        entry.status,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [entries, searchTerm, statusFilter]);

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft({
      id: selected.id,
      date: selected.date,
      company_name: selected.company_name,
      position: selected.position,
      salary: selected.salary,
      location: selected.location,
      job_source: selected.job_source,
      link: selected.link,
      expected_salary: selected.expected_salary,
      job_description: selected.job_description,
      resume_latex: selected.resume_latex,
      question_answers: selected.question_answers ?? [],
      status: selected.status,
    });
    setSaveMessage(null);
  }, [selected]);

  const updateDraftField = useCallback(
    <K extends keyof DraftEntry>(key: K, value: DraftEntry[K]) => {
      setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
      setSaveMessage(null);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const updated = await updateApplyJournal(draft.id, {
        date: draft.date,
        company_name: draft.company_name,
        position: draft.position,
        salary: draft.salary,
        location: draft.location,
        job_source: draft.job_source,
        link: draft.link,
        expected_salary: draft.expected_salary,
        job_description: draft.job_description,
        resume_latex: draft.resume_latex,
        question_answers: draft.question_answers,
        status: draft.status,
      });
      setEntries((prev) =>
        prev.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setSaveMessage("Saved.");
    } catch (e) {
      setSaveMessage(
        e instanceof Error ? e.message : "Could not save this entry.",
      );
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const handleUseInHome = useCallback(() => {
    if (!draft) return;
    navigate("/", {
      state: {
        journalEntry: {
          job_description: draft.job_description,
          resume_latex: draft.resume_latex,
          date: draft.date,
          company_name: draft.company_name,
          position: draft.position,
          salary: draft.salary,
          location: draft.location,
          job_source: draft.job_source,
          link: draft.link,
          expected_salary: draft.expected_salary,
          status: draft.status,
        },
      },
    });
  }, [draft, navigate]);

  const handleDelete = useCallback(async () => {
    if (!draft) return;
    setDeleting(true);
    setSaveMessage(null);
    try {
      await deleteApplyJournal(draft.id);
      setEntries((prev) => prev.filter((entry) => entry.id !== draft.id));
      setDeletePromptOpen(false);
      setSelectedId((prev) => {
        if (prev !== draft.id) return prev;
        const remaining = entries.filter((entry) => entry.id !== draft.id);
        return remaining[0]?.id ?? null;
      });
      setSaveMessage("Entry deleted.");
    } catch (e) {
      setSaveMessage(
        e instanceof Error ? e.message : "Could not delete this entry.",
      );
    } finally {
      setDeleting(false);
    }
  }, [draft, entries]);

  const toggleStatusFilter = useCallback((status: JournalStatus) => {
    setStatusFilter((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status],
    );
  }, []);

  const addQuestionAnswer = useCallback(() => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            question_answers: [...prev.question_answers, { question: "", answer: "" }],
          }
        : prev,
    );
  }, []);

  const removeQuestionAnswer = useCallback((idx: number) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            question_answers: prev.question_answers.filter((_, i) => i !== idx),
          }
        : prev,
    );
  }, []);

  const updateQuestionAnswer = useCallback(
    (idx: number, key: "question" | "answer", value: string) => {
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              question_answers: prev.question_answers.map((qa, i) =>
                i === idx ? { ...qa, [key]: value } : qa,
              ),
            }
          : prev,
      );
      setSaveMessage(null);
    },
    [],
  );

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-3xl">
        Apply history
      </h1>
      <p className="mt-2 text-[14px] text-[var(--color-muted)]">
        Pick an entry, update details, then reuse it in Home.
      </p>

      {error ? (
        <div className="mt-5 rounded-lg border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-3 text-[13px] text-[var(--color-danger-text)]">
          {error}
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="text-[13px] font-semibold text-[var(--color-ink)]">
            Journal entries
          </h2>
          <div className="mt-3 space-y-2 border-b border-[var(--color-border)] pb-3">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search company, role, source..."
              className={inputClass}
            />
            <div className="flex flex-wrap gap-1.5">
              {JOURNAL_STATUS_OPTIONS.map((option) => {
                const active = statusFilter.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleStatusFilter(option.value)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                      active
                        ? STATUS_BADGE_CLASS[option.value]
                        : "border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-elevated)]"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
              {(searchTerm || statusFilter.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setStatusFilter([]);
                  }}
                  className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-muted)] hover:bg-[var(--color-surface-elevated)]"
                >
                  Clear filters
                </button>
              )}
            </div>
            <p className="text-[11px] text-[var(--color-muted)]">
              {filteredEntries.length} of {entries.length} entries
            </p>
          </div>
          {loading ? (
            <p className="mt-3 text-[13px] text-[var(--color-muted)]">
              Loading...
            </p>
          ) : entries.length === 0 ? (
            <p className="mt-3 text-[13px] text-[var(--color-muted)]">
              No saved applications yet.
            </p>
          ) : filteredEntries.length === 0 ? (
            <p className="mt-3 text-[13px] text-[var(--color-muted)]">
              No entries match the current filters.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {filteredEntries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(entry.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-[12px] transition ${
                      entry.id === selectedId
                        ? "border-indigo-400 bg-indigo-500/10"
                        : "border-[var(--color-border)] hover:bg-[var(--color-surface-elevated)]"
                    }`}
                  >
                    <p className="font-semibold text-[var(--color-ink)]">
                      {entry.company_name || "Untitled company"}
                    </p>
                    <p className="mt-1 text-[var(--color-muted)]">
                      {entry.position || "Untitled position"}
                    </p>
                    <span
                      className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        STATUS_BADGE_CLASS[entry.status]
                      }`}
                    >
                      {entry.status}
                    </span>
                    <p className="mt-1 text-[var(--color-muted)]">
                      {entry.date || "No date"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          {!draft ? (
            <p className="text-[13px] text-[var(--color-muted)]">
              Select an entry on the left.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={draft.date}
                  onChange={(e) => updateDraftField("date", e.target.value)}
                  placeholder="Date (e.g. 2026-04-15)"
                  className={inputClass}
                />
                <select
                  value={draft.status}
                  onChange={(e) =>
                    updateDraftField("status", e.target.value as JournalStatus)
                  }
                  className={inputClass}
                >
                  {JOURNAL_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  value={draft.company_name}
                  onChange={(e) =>
                    updateDraftField("company_name", e.target.value)
                  }
                  placeholder="Company name"
                  className={inputClass}
                />
                <input
                  value={draft.position}
                  onChange={(e) => updateDraftField("position", e.target.value)}
                  placeholder="Position"
                  className={inputClass}
                />
                <input
                  value={draft.salary}
                  onChange={(e) => updateDraftField("salary", e.target.value)}
                  placeholder="Salary"
                  className={inputClass}
                />
                <input
                  value={draft.expected_salary}
                  onChange={(e) =>
                    updateDraftField("expected_salary", e.target.value)
                  }
                  placeholder="Expected salary"
                  className={inputClass}
                />
                <input
                  value={draft.location}
                  onChange={(e) => updateDraftField("location", e.target.value)}
                  placeholder="Location"
                  className={inputClass}
                />
                <input
                  value={draft.job_source}
                  onChange={(e) =>
                    updateDraftField("job_source", e.target.value)
                  }
                  placeholder="Job source (LinkedIn, etc.)"
                  className={inputClass}
                />
                <input
                  value={draft.link}
                  onChange={(e) => updateDraftField("link", e.target.value)}
                  placeholder="Link (job/application URL)"
                  className={inputClass}
                />
              </div>

              <textarea
                value={draft.job_description}
                onChange={(e) =>
                  updateDraftField("job_description", e.target.value)
                }
                placeholder="Job description"
                rows={8}
                className={`${inputClass} mt-4 resize-y`}
              />
              <textarea
                value={draft.resume_latex}
                onChange={(e) => updateDraftField("resume_latex", e.target.value)}
                placeholder="Generated LaTeX resume"
                rows={8}
                className={`${inputClass} mt-3 resize-y font-mono`}
              />

              <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold text-[var(--color-ink)]">
                    Application question answers
                  </p>
                  <button
                    type="button"
                    onClick={addQuestionAnswer}
                    className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-ink)]"
                  >
                    + Add question
                  </button>
                </div>
                {draft.question_answers.length === 0 ? (
                  <p className="mt-2 text-[12px] text-[var(--color-muted)]">
                    No saved Q&A yet.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {draft.question_answers.map((qa, idx) => (
                      <div
                        key={`qa-${idx}`}
                        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5"
                      >
                        <input
                          value={qa.question}
                          onChange={(e) =>
                            updateQuestionAnswer(idx, "question", e.target.value)
                          }
                          placeholder="Question"
                          className={inputClass}
                        />
                        <textarea
                          value={qa.answer}
                          onChange={(e) =>
                            updateQuestionAnswer(idx, "answer", e.target.value)
                          }
                          placeholder="Answer"
                          rows={3}
                          className={`${inputClass} mt-2 resize-y`}
                        />
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => removeQuestionAnswer(idx)}
                            className="rounded-md border border-red-300 px-2.5 py-1 text-[11px] font-semibold text-red-700 dark:border-red-800 dark:text-red-300"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="rounded-xl bg-[var(--color-primary)] px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={handleUseInHome}
                  className="rounded-xl border border-[var(--color-border)] px-5 py-2 text-[13px] font-semibold text-[var(--color-ink)]"
                >
                  Use in Home
                </button>
                <button
                  type="button"
                  onClick={() => setDeletePromptOpen(true)}
                  className="rounded-xl border border-red-300 px-5 py-2 text-[13px] font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
                >
                  Delete entry
                </button>
              </div>
              {saveMessage ? (
                <p className="mt-3 text-[12px] text-[var(--color-muted)]">
                  {saveMessage}
                </p>
              ) : null}
            </>
          )}
        </section>
      </div>
      {deletePromptOpen && draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl">
            <h3 className="text-[16px] font-semibold text-[var(--color-ink)]">
              Delete this journal entry?
            </h3>
            <p className="mt-2 text-[13px] text-[var(--color-muted)]">
              This removes{" "}
              <span className="font-semibold text-[var(--color-ink)]">
                {draft.company_name || "Untitled company"}
              </span>{" "}
              from history. This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletePromptOpen(false)}
                disabled={deleting}
                className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[12px] font-semibold text-[var(--color-ink)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
