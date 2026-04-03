export type ThemePreference = "system" | "light" | "dark";

const KEY = "aaa-theme-preference-v1";

export function loadThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "system" || v === "light" || v === "dark") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

export function saveThemePreference(p: ThemePreference): void {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* ignore */
  }
}
