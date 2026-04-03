"""Compile LaTeX to PDF: optional HTTP sidecar, or pdflatex / tectonic on PATH."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

import httpx

from .config import settings


class PdfCompileError(Exception):
    """Raised when LaTeX compilation fails or no compiler is available."""


def _extract_line_number_from_log(raw_log: str) -> int | None:
    """
    Extract the first TeX line number reported as `l.<n>` in the log.
    Example:
      Misplaced alignment tab character &.
      l.43 ... Cloud &
    """
    import re

    m = re.search(r"^[ \t]*l\.(\d+)\b", raw_log, flags=re.MULTILINE)
    if not m:
        m = re.search(r"l\.(\d+)\b", raw_log)
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def _escape_ampersands_in_line(tex: str, line_no: int) -> str | None:
    if line_no <= 0:
        return None
    lines = tex.splitlines()
    if line_no > len(lines):
        return None
    # Escape the alignment character in that specific line.
    lines[line_no - 1] = lines[line_no - 1].replace("&", r"\&")
    return "\n".join(lines)


def _apply_latex_compat_fixes(tex: str) -> str:
    """
    Apply tiny compatibility fixes for common generated-template failures.

    1) `titlesec` + `\\uppercase` can transform `\\color{rule1}` into `\\color{RULE1}`.
       If `rule1` is defined but `RULE1` is not, mirror the definition.
    """
    import re

    out = tex
    m = re.search(r"\\definecolor\{rule1\}\{HTML\}\{([0-9A-Fa-f]{6})\}", out)
    has_upper = re.search(r"\\definecolor\{RULE1\}\{HTML\}\{[0-9A-Fa-f]{6}\}", out)
    if m and not has_upper:
        hex_color = m.group(1).upper()
        insert = f"\n\\definecolor{{RULE1}}{{HTML}}{{{hex_color}}}"
        out = out.replace(m.group(0), m.group(0) + insert, 1)
    return out

def _remote_compile_url() -> str:
    return settings.pdf_remote_compile_url.strip().rstrip("/")


def pdflatex_available() -> bool:
    return shutil.which("pdflatex") is not None


def tectonic_available() -> bool:
    return shutil.which("tectonic") is not None


def remote_compile_configured() -> bool:
    return bool(_remote_compile_url())


def latex_compile_available() -> bool:
    return (
        remote_compile_configured()
        or pdflatex_available()
        or tectonic_available()
    )


def _format_compiler_log(stderr: str, stdout: str, max_len: int = 12000) -> str:
    """Keep the tail of the log (LaTeX prints real errors at the end)."""
    text = (stderr or "").strip() + "\n" + (stdout or "").strip()
    text = text.strip()
    if len(text) <= max_len:
        return text
    head_keep = 900
    tail_keep = max_len - head_keep - 80
    omitted = len(text) - head_keep - tail_keep
    return (
        text[:head_keep]
        + f"\n\n… [omitted {omitted} characters] …\n\n--- end of log ---\n"
        + text[-tail_keep:]
    )


def _read_log_text_capped(path: Path, max_bytes: int = 800_000) -> str:
    try:
        data = path.read_bytes()
    except OSError:
        return ""
    if len(data) > max_bytes:
        data = data[-max_bytes:]
    return data.decode("utf-8", errors="replace").strip()


def _string_tail(text: str, max_chars: int = 10000) -> str:
    text = text.strip()
    if len(text) <= max_chars:
        return text
    return (
        f"… [omitted first {len(text) - max_chars} characters] …\n\n"
        + text[-max_chars:]
    )


def _first_latex_error_block(raw_log: str, context_lines: int = 48) -> str | None:
    """Prefer real errors over the trailing 'Fatal error occurred' summary line."""
    lines = raw_log.splitlines()
    n = len(lines)

    def chunk(start: int) -> str:
        return "\n".join(lines[start : min(start + context_lines, n)])

    for i, line in enumerate(lines):
        if line.strip().startswith("!"):
            return chunk(i)
    for i, line in enumerate(lines):
        if "LaTeX Error" in line or "Emergency stop" in line:
            return chunk(i)
    for i, line in enumerate(lines):
        if "Package " in line and " Error" in line:
            return chunk(i)
    for i, line in enumerate(lines):
        if line.strip().startswith("*** "):
            return chunk(i)
    for i, line in enumerate(lines):
        if "Fatal error" in line and "output PDF" in line:
            return chunk(i)
    return None


def _pdflatex_failure_message(
    tmp_path: Path,
    jobname: str,
    result: subprocess.CompletedProcess[str],
) -> str:
    """Prefer the `.log` file; terminal capture often misses or truncates the error."""
    parts: list[str] = []
    log_path = tmp_path / f"{jobname}.log"
    if log_path.is_file():
        raw = _read_log_text_capped(log_path)
        if raw:
            err = _first_latex_error_block(raw)
            if err:
                parts.append(
                    f"--- {jobname}.log (LaTeX error block; lines starting with ! ) ---\n"
                    f"{err}"
                )
            parts.append(f"--- {jobname}.log (tail) ---\n{_string_tail(raw, 10000)}")
    transcript = _format_compiler_log(result.stderr or "", result.stdout or "")
    if transcript:
        parts.append(f"--- pdflatex terminal output ---\n{transcript}")
    if not parts:
        parts.append(f"pdflatex exited with code {result.returncode}.")
    return "\n\n".join(parts)


def _tmp_dir_listing(tmp_path: Path, limit: int = 12) -> str:
    try:
        names = sorted(p.name for p in tmp_path.iterdir())
    except OSError:
        return "(could not list temp dir)"
    if len(names) > limit:
        names = names[:limit] + [f"... +{len(names) - limit} more"]
    return ", ".join(names) if names else "(empty)"


def _compile_via_remote_http(tex: str) -> bytes:
    base = _remote_compile_url()
    if not base:
        raise PdfCompileError("PDF remote compile URL is not configured.")

    url = f"{base}/"
    try:
        with httpx.Client(timeout=httpx.Timeout(180.0, connect=10.0)) as client:
            r = client.post(
                url,
                files={
                    "latex": (
                        "resume.tex",
                        tex.encode("utf-8"),
                        "application/x-tex",
                    ),
                },
            )
    except httpx.RequestError as e:
        raise PdfCompileError(
            f"Could not reach PDF compile service at {base!r}: {e}"
        ) from e

    if r.status_code != 200:
        detail = (r.text or r.reason_phrase or "")[:4000]
        raise PdfCompileError(
            f"PDF service returned HTTP {r.status_code}. "
            f"Response (truncated):\n\n{detail}"
        )

    data = r.content
    if len(data) < 100 or not data.startswith(b"%PDF"):
        snippet = data[:500].decode("utf-8", errors="replace")
        raise PdfCompileError(
            "PDF service did not return a valid PDF. "
            f"Body starts with:\n{snippet}"
        )
    return data


def _compile_with_pdflatex(tex: str) -> bytes:
    with tempfile.TemporaryDirectory(prefix="aaa-latex-") as tmp:
        tmp_path = Path(tmp)
        tex_file = tmp_path / "resume.tex"
        tex_file.write_text(tex, encoding="utf-8")
        pdf_file = tmp_path / "resume.pdf"

        cmd = [
            "pdflatex",
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-file-line-error",
            f"-output-directory={tmp_path}",
            str(tex_file),
        ]

        last_result: subprocess.CompletedProcess[str] | None = None
        try:
            for _ in range(2):
                last_result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=120,
                    cwd=tmp_path,
                    check=False,
                )
        except subprocess.TimeoutExpired as e:
            raise PdfCompileError("LaTeX compile timed out.") from e

        result = last_result
        if result is None:
            raise PdfCompileError("pdflatex did not run.")

        if (not pdf_file.is_file()) or (result.returncode != 0):
            # Heuristic auto-fix for the common model issue:
            # `Misplaced alignment tab character &` caused by unescaped `&` in text.
            raw_log = _read_log_text_capped(tmp_path / "resume.log")
            if (
                raw_log
                and "Misplaced alignment tab character &" in raw_log
                and "l." in raw_log
            ):
                line_no = _extract_line_number_from_log(raw_log)
                fixed = _escape_ampersands_in_line(tex, line_no) if line_no else None
                if fixed and fixed != tex:
                    tex_file.write_text(fixed, encoding="utf-8")
                    # Retry once with the fixed source.
                    for _ in range(2):
                        result = subprocess.run(
                            cmd,
                            capture_output=True,
                            text=True,
                            timeout=120,
                            cwd=tmp_path,
                            check=False,
                        )

            # Re-check after optional retry
            if not pdf_file.is_file():
                extra = _tmp_dir_listing(tmp_path)
                log = _pdflatex_failure_message(tmp_path, "resume", result)
                raise PdfCompileError(
                    "LaTeX did not produce a PDF. "
                    f"Files in build directory: {extra}\n\n{log}"
                )

        if result.returncode != 0:
            data = pdf_file.read_bytes()
            if len(data) < 100:
                log = _pdflatex_failure_message(tmp_path, "resume", result)
                raise PdfCompileError(
                    "LaTeX build failed.\n\n" + log
                )
            return data

        return pdf_file.read_bytes()


def _compile_with_tectonic(tex: str) -> bytes:
    with tempfile.TemporaryDirectory(prefix="aaa-tectonic-") as tmp:
        tmp_path = Path(tmp)
        tex_file = tmp_path / "resume.tex"
        tex_file.write_text(tex, encoding="utf-8")
        pdf_file = tmp_path / "resume.pdf"

        try:
            result = subprocess.run(
                ["tectonic", str(tex_file)],
                cwd=tmp_path,
                capture_output=True,
                text=True,
                timeout=180,
                check=False,
            )
        except subprocess.TimeoutExpired as e:
            raise PdfCompileError("Tectonic compile timed out.") from e

        if not pdf_file.is_file():
            log = _format_compiler_log(result.stderr or "", result.stdout or "")
            if not log:
                log = f"tectonic exited with code {result.returncode}."
            extra = _tmp_dir_listing(tmp_path)
            raise PdfCompileError(
                "LaTeX did not produce a PDF. "
                f"Files in build directory: {extra}\n\nCompiler output:\n\n"
                + log
            )

        if result.returncode != 0:
            data = pdf_file.read_bytes()
            if len(data) < 100:
                log = _format_compiler_log(
                    result.stderr or "",
                    result.stdout or "",
                )
                raise PdfCompileError(
                    "LaTeX build failed. Output:\n\n" + log
                )
            return data

        return pdf_file.read_bytes()


def compile_latex_to_pdf(tex: str) -> bytes:
    """
    Compile LaTeX to PDF.

    Order: ``PDF_REMOTE_COMPILE_URL`` (e.g. 4teamwork/pdflatex sidecar), then
    ``pdflatex``, then ``tectonic``.
    """
    tex = tex.strip()
    if not tex:
        raise PdfCompileError("Empty LaTeX source.")
    tex = _apply_latex_compat_fixes(tex)

    if remote_compile_configured():
        return _compile_via_remote_http(tex)
    if pdflatex_available():
        return _compile_with_pdflatex(tex)
    if tectonic_available():
        return _compile_with_tectonic(tex)

    raise PdfCompileError(
        "No PDF engine configured. Set PDF_REMOTE_COMPILE_URL (see Docker "
        "Compose), or install `pdflatex` (TeX Live / MacTeX) or `tectonic`, "
        "or download the .tex file and compile locally."
    )
