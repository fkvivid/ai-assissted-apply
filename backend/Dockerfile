# TeX Live + pandoc from https://hub.docker.com/r/pandoc/latex — pdflatex on PATH.
# Extra Debian packages cover Charter (bchr8t) for the default template.
FROM pandoc/latex:latest-ubuntu

# Base image sets ENTRYPOINT to pandoc; we run uvicorn/Python instead.
ENTRYPOINT []

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# pandoc/latex ships TeX Live under /opt/texlive; install required LaTeX/fonts there.
RUN tlmgr update --self && tlmgr install \
    enumitem \
    titlesec \
    collection-fontsrecommended \
    collection-fontsextra

WORKDIR /app
COPY requirements.txt .
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY scripts ./scripts

ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
