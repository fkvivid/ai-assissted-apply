#!/usr/bin/env python3
"""Verify bundled default LaTeX template compiles (needs pdflatex on PATH)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.pdf_compile import PdfCompileError, compile_latex_to_pdf  # noqa: E402


def main() -> None:
    tex_path = ROOT / "app" / "default_template.tex"
    tex = tex_path.read_text(encoding="utf-8")
    try:
        pdf = compile_latex_to_pdf(tex)
    except PdfCompileError as e:
        print("FAIL — default template did not compile:\n", e, file=sys.stderr)
        sys.exit(1)
    if len(pdf) < 100 or not pdf.startswith(b"%PDF"):
        print("FAIL — output is not a PDF.", file=sys.stderr)
        sys.exit(1)
    print(f"OK — default template PDF: {len(pdf)} bytes")


if __name__ == "__main__":
    main()
