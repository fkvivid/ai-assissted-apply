import { useEffect } from "react";

type Props = {
  message: string | null;
  variant?: "error" | "info";
  onDismiss: () => void;
};

export function Toast({ message, variant = "error", onDismiss }: Props) {
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(onDismiss, 5200);
    return () => window.clearTimeout(id);
  }, [message, onDismiss]);

  if (!message) return null;

  const styles =
    variant === "error"
      ? "border-red-200/90 bg-red-50/95 text-red-950 shadow-[0_8px_30px_-8px_rgba(220,38,38,0.35)] backdrop-blur-md dark:border-red-900/80 dark:bg-red-950/95 dark:text-red-50"
      : "border-[var(--color-border)] bg-[var(--color-surface)]/95 text-[var(--color-ink)] shadow-[var(--shadow-elevated)] backdrop-blur-md";

  return (
    <div
      role="alert"
      className={`fixed bottom-8 left-1/2 z-[100] flex max-w-md -translate-x-1/2 items-start gap-3 rounded-2xl border px-5 py-4 text-[13px] font-semibold leading-snug ${styles}`}
    >
      <span className="mt-0.5 text-[15px] opacity-90" aria-hidden>
        {variant === "error" ? "⚠" : "ℹ"}
      </span>
      <p className="flex-1">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-lg px-2 py-1 text-[18px] leading-none opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
