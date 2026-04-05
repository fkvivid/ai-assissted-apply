const API_BASE = "";

export type GenerateRequest = {
  resume: string;
  job_description: string;
  template: string;
  use_default_template: boolean;
  ai_instructions: string;
};

export type GenerateResponse = {
  latex: string;
  model: string;
  match_percent: number | null;
  original_match_percent: number | null;
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
