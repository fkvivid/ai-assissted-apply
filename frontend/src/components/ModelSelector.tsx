import { useEffect, useMemo, useState } from "react";
import { getAiStatus, listModels, type AiStatus, type ModelInfo } from "../api";

const PARTNER_PROVIDERS: string[] = [
  "openai",
  "anthropic",
  "minimax",
  "moonshotai",
];

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic · Claude",
  minimax: "MiniMax",
  moonshotai: "Moonshot AI · Kimi",
  openai: "OpenAI · GPT",
};

/** Shown when nothing is selected and server has no default from catalog yet. */
export const DEFAULT_MODEL_ID = "gpt-5.4";

function modelLabel(m: ModelInfo): string {
  return m.name && m.name !== m.id ? m.name : (m.id.split("/").pop() ?? m.id);
}

function providerOf(id: string): string {
  const i = id.indexOf("/");
  return i === -1 ? "openai" : id.slice(0, i);
}

type Props = {
  value: string;
  onChange: (modelId: string) => void;
  className?: string;
};

export function ModelSelector({ value, onChange, className }: Props) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [defaultModel, setDefaultModel] = useState<string>("");
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([listModels(), getAiStatus()])
      .then(([modelsRes, statusRes]) => {
        if (cancelled) return;
        setModels(modelsRes.items);
        setDefaultModel(modelsRes.default_model ?? statusRes.default_model);
        setStatus(statusRes);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load models.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveValue =
    value.trim() || defaultModel.trim() || DEFAULT_MODEL_ID;

  const augmentedModels = useMemo(() => {
    const have = new Set(models.map((m) => m.id));
    const extra: ModelInfo[] = [];
    const ensure = (id: string) => {
      if (!id || have.has(id)) return;
      have.add(id);
      extra.push({
        id,
        name: id.split("/").pop() ?? id,
        provider: providerOf(id),
        description: "",
      });
    };
    ensure(defaultModel);
    ensure(DEFAULT_MODEL_ID);
    ensure(value.trim());
    ensure(effectiveValue);
    return extra.length ? [...models, ...extra] : models;
  }, [models, defaultModel, value, effectiveValue]);

  const grouped = useMemo(() => {
    const byProvider = new Map<string, ModelInfo[]>();
    for (const m of augmentedModels) {
      const provider = m.provider || providerOf(m.id);
      const list = byProvider.get(provider) ?? [];
      list.push(m);
      byProvider.set(provider, list);
    }
    for (const list of byProvider.values()) {
      list.sort((a, b) => modelLabel(a).localeCompare(modelLabel(b)));
    }
    const partners = PARTNER_PROVIDERS.filter((p) => byProvider.has(p)).map(
      (p) => ({ provider: p, items: byProvider.get(p)! }),
    );
    const others = [...byProvider.entries()]
      .filter(([p]) => !PARTNER_PROVIDERS.includes(p))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, items]) => ({ provider, items }));
    return { partners, others };
  }, [augmentedModels]);

  const configured = !!status?.configured;
  const inGatewayMode = status?.mode === "gateway";
  const disabled = loading || !!error || !configured;

  return (
    <div className={className ?? ""}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label
          htmlFor="model-select"
          className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-muted)]"
        >
          Model
        </label>
        {status ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              !configured
                ? "border border-rose-300/50 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                : inGatewayMode
                  ? "border border-indigo-300/60 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                  : "border border-emerald-300/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            }`}
            title={
              !configured
                ? "Add API key in backend/.env"
                : inGatewayMode
                  ? "Model catalog loaded"
                  : "Ready"
            }
          >
            {!configured ? "No key" : inGatewayMode ? "Connected" : "Ready"}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-muted)]">
        Same model for tailoring, keyword gaps, application text, and job-fit
        scoring after each run. Default:{" "}
        <code className="rounded bg-[var(--color-code-bg)] px-1 font-mono text-[11px]">
          {DEFAULT_MODEL_ID}
        </code>
        .
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          id="model-select"
          value={effectiveValue}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-[18rem] max-w-full grow rounded-xl border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-[13px] font-medium text-[var(--color-ink)] shadow-inner focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600"
        >
          {loading ? <option value="">Loading models…</option> : null}
          {error ? <option value="">Could not load model list</option> : null}
          {!configured && !loading && !error ? (
            <option value="">Configure API key in backend/.env</option>
          ) : null}

          {!loading && !error && configured && grouped.partners.length > 0 ? (
            <optgroup label="★ Major providers">
              {grouped.partners.flatMap(({ provider, items }) =>
                items.map((m) => (
                  <option key={m.id} value={m.id}>
                    {`${PROVIDER_LABELS[provider] ?? provider} — ${modelLabel(m)}`}
                  </option>
                )),
              )}
            </optgroup>
          ) : null}

          {!loading && !error && configured
            ? grouped.others.map(({ provider, items }) => (
                <optgroup key={provider} label={provider}>
                  {items.map((m) => (
                    <option key={m.id} value={m.id}>
                      {modelLabel(m)}
                    </option>
                  ))}
                </optgroup>
              ))
            : null}
        </select>

        {value.trim() &&
        value.trim() !== DEFAULT_MODEL_ID &&
        !disabled ? (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_MODEL_ID)}
            title={`Use ${DEFAULT_MODEL_ID}`}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-muted)] transition hover:text-[var(--color-ink)] dark:border-zinc-600"
          >
            Reset to {DEFAULT_MODEL_ID}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 text-[12px] font-medium text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      {!loading && !error && configured ? (
        <p className="mt-2 font-mono text-[11px] text-[var(--color-muted)]">
          Active: {effectiveValue} · server .env default: {defaultModel || "—"}
        </p>
      ) : null}
    </div>
  );
}
