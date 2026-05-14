const API_BASE = "";

export type GenerateRequest = {
  resume: string;
  job_description: string;
  template: string;
  use_default_template: boolean;
  ai_instructions: string;
  additional_instructions: string;
  /** Main-task gateway id (resume + keyword gaps). Empty → server AI_DEFAULT_MODEL */
  model?: string;
};

export type GenerateResponse = {
  latex: string;
  model: string;
};

export type GenerateApplicationTextRequest = {
  resume: string;
  job_description: string;
  additional_instructions: string;
  task_prompt: string;
  /** Other-task gateway id (cover letters, etc.). Empty → server AI_DEFAULT_MODEL */
  model?: string;
};

export type GenerateApplicationTextResponse = {
  text: string;
  model: string;
};

export type AnalyzeKeywordGapsRequest = {
  job_description: string;
  resume: string;
  /** Same as main-task model on the home page */
  model?: string;
};

export type CompareResumeJobMatchRequest = {
  job_description: string;
  resume_original: string;
  resume_new_latex: string;
  /** Other-task model for scoring */
  model?: string;
};

export type CompareResumeJobMatchResponse = {
  job_match_old: number;
  job_match_new: number;
  keywords_old: number;
  keywords_new: number;
  role_fit_old: number;
  role_fit_new: number;
  evidence_old: number;
  evidence_new: number;
  match_lift: number;
  headline: string;
  summary: string;
  what_improved: string[];
  still_watch: string[];
  model: string;
};

export type AiStatus = {
  configured: boolean;
  mode: string;
  default_model: string;
  providers: string[];
};

export type ModelInfo = {
  id: string;
  name: string;
  provider: string;
  description: string;
};

export type AnalyzeKeywordGapsResponse = {
  missing_keywords: string[];
  matched_keywords: string[];
  model: string;
};

export type ApplyJournalEntry = {
  id: string;
  date: string;
  company_name: string;
  position: string;
  salary: string;
  location: string;
  job_source: string;
  link: string;
  expected_salary: string;
  job_description: string;
  resume_latex: string;
  question_answers: Array<{ question: string; answer: string }>;
  status:
    | "applied"
    | "interviewing"
    | "rejected"
    | "ghosted"
    | "offer"
    | "withdrawn";
  created_at: string;
  updated_at: string;
};

export type ApplyJournalCreateRequest = {
  date?: string;
  company_name?: string;
  position?: string;
  salary?: string;
  location?: string;
  job_source?: string;
  link?: string;
  expected_salary?: string;
  job_description?: string;
  resume_latex?: string;
  question_answers?: Array<{ question?: string; answer?: string }>;
  status?:
    | "applied"
    | "interviewing"
    | "rejected"
    | "ghosted"
    | "offer"
    | "withdrawn";
};

export type ApplyJournalUpdateRequest = Partial<ApplyJournalCreateRequest>;
export type ApplyJournalListResponse = {
  items: ApplyJournalEntry[];
  total: number;
  page: number;
  page_size: number;
};

function parseDetailPayload(err: { detail?: unknown }): string {
  const d = err.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d
      .map((item) => {
        if (typeof item === "object" && item !== null && "msg" in item) {
          return String((item as { msg?: string }).msg);
        }
        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join(" ");
  }
  if (typeof d === "object" && d !== null) {
    return JSON.stringify(d);
  }
  return "";
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const ct = res.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      const err = (await res.json()) as { detail?: unknown };
      const msg = parseDetailPayload(err);
      if (msg) return msg;
    } else {
      const text = await res.text();
      if (text.trim()) return text.trim().slice(0, 4000);
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export async function getAiStatus(): Promise<AiStatus> {
  const res = await fetch(`${API_BASE}/api/ai-status`);
  if (!res.ok) {
    const msg = await readErrorMessage(res, res.statusText);
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function listModels(): Promise<{
  items: ModelInfo[];
  default_model?: string;
}> {
  const res = await fetch(`${API_BASE}/api/models`);
  if (!res.ok) {
    const msg = await readErrorMessage(res, res.statusText);
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function compareResumeJobMatch(
  body: CompareResumeJobMatchRequest,
): Promise<CompareResumeJobMatchResponse> {
  const res = await fetch(`${API_BASE}/api/compare-resume-job-match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await readErrorMessage(res, res.statusText);
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function generateResume(
  body: GenerateRequest,
): Promise<GenerateResponse> {
  const res = await fetch(`${API_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await readErrorMessage(res, res.statusText);
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function analyzeKeywordGaps(
  body: AnalyzeKeywordGapsRequest,
): Promise<AnalyzeKeywordGapsResponse> {
  const res = await fetch(`${API_BASE}/api/analyze-keyword-gaps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await readErrorMessage(res, res.statusText);
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function generateApplicationText(
  body: GenerateApplicationTextRequest,
): Promise<GenerateApplicationTextResponse> {
  const res = await fetch(`${API_BASE}/api/generate-application-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await readErrorMessage(res, res.statusText);
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function compilePdf(latex: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/compile-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ latex }),
  });
  if (!res.ok) {
    const msg = await readErrorMessage(res, res.statusText);
    throw new Error(msg || `PDF compile failed (${res.status})`);
  }
  return res.blob();
}

export async function getPdfStatus(): Promise<{
  pdflatex_available: boolean;
  tectonic_available: boolean;
  remote_compile_configured: boolean;
  compile_available: boolean;
}> {
  const res = await fetch(`${API_BASE}/api/pdf-status`);
  if (!res.ok) {
    throw new Error("Could not check PDF status");
  }
  return res.json();
}

export async function getApplyJournalStatus(): Promise<{ enabled: boolean }> {
  const res = await fetch(`${API_BASE}/api/apply-journal/status`);
  if (!res.ok) {
    const msg = await readErrorMessage(
      res,
      "Could not check apply journal status.",
    );
    throw new Error(msg);
  }
  return res.json();
}

export async function listApplyJournal(
  page = 1,
  pageSize = 20,
): Promise<ApplyJournalListResponse> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  const res = await fetch(`${API_BASE}/api/apply-journal?${params.toString()}`);
  if (!res.ok) {
    const msg = await readErrorMessage(res, "Could not load apply journal.");
    throw new Error(msg);
  }
  return res.json();
}

export async function createApplyJournal(
  body: ApplyJournalCreateRequest,
): Promise<ApplyJournalEntry> {
  const res = await fetch(`${API_BASE}/api/apply-journal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await readErrorMessage(res, "Could not save apply journal.");
    throw new Error(msg);
  }
  return res.json();
}

export async function updateApplyJournal(
  id: string,
  body: ApplyJournalUpdateRequest,
): Promise<ApplyJournalEntry> {
  const res = await fetch(`${API_BASE}/api/apply-journal/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await readErrorMessage(res, "Could not update apply journal.");
    throw new Error(msg);
  }
  return res.json();
}

export async function deleteApplyJournal(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/apply-journal/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const msg = await readErrorMessage(res, "Could not delete apply journal.");
    throw new Error(msg);
  }
}
