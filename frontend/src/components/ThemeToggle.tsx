import type { ThemePreference } from "../themeStorage";
import { useTheme } from "../useTheme";

const options: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div
      className="inline-flex rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-1 shadow-inner"
      role="group"
      aria-label="Color theme"
    >
      {options.map(({ value, label }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setPreference(value)}
            className={`rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition ${
              active
                ? "bg-[var(--color-primary)] text-white shadow-sm dark:bg-indigo-500"
                : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
