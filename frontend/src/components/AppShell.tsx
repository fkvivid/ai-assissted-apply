import { Link, NavLink, Outlet } from "react-router-dom";
import { BrandIcon } from "./BrandIcon";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-2 text-[13px] font-semibold tracking-wide transition-all duration-200 ${
    isActive
      ? "bg-[var(--color-ink)] text-[var(--color-surface)] shadow-md dark:bg-white dark:text-zinc-900"
      : "text-[var(--color-muted)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-ink)]"
  }`;

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-[var(--color-border)]/80 bg-[var(--color-surface)]/80 backdrop-blur-xl dark:bg-[var(--color-surface)]/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-4 sm:px-8">
          <Link
            to="/"
            className="group flex items-center gap-3.5 text-[var(--color-ink)]"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-surface-elevated)] to-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-card)] ring-1 ring-[var(--color-border)] transition group-hover:shadow-[var(--shadow-elevated)] dark:from-zinc-800 dark:to-zinc-900">
              <BrandIcon className="size-[22px]" />
            </span>
            <span className="flex flex-col">
              <span className="text-[15px] font-semibold tracking-tight sm:text-base">
                AI Assisted Apply
              </span>
              <span className="hidden text-[11px] font-medium text-[var(--color-muted)] sm:block">
                Tailored resumes, honest output
              </span>
            </span>
          </Link>
          <nav className="flex items-center gap-1.5 sm:gap-2">
            <NavLink to="/" end className={navClass}>
              Home
            </NavLink>
            <NavLink to="/history" className={navClass}>
              History
            </NavLink>
            <NavLink to="/settings" className={navClass}>
              Settings
            </NavLink>
          </nav>
        </div>
      </header>

      <Outlet />

      <footer className="mt-auto border-t border-[var(--color-border)] bg-[var(--color-surface)]/90 py-10 backdrop-blur-sm dark:bg-[var(--color-surface)]/80">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-3 px-5 text-[13px] text-[var(--color-muted)] sm:flex-row sm:gap-8">
          <span className="font-medium">
            © {new Date().getFullYear()} AI Assisted Apply
          </span>
          <span className="hidden h-4 w-px bg-[var(--color-border)] sm:block" />
          <div className="flex gap-6">
            <Link
              to="/about"
              className="font-medium text-[var(--color-muted)] transition hover:text-[var(--color-primary)]"
            >
              About
            </Link>
            <a
              href="https://github.com/fkvivid/ai-assissted-apply/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--color-muted)] transition hover:text-[var(--color-primary)]"
            >
              Feedback
            </a>
          </div>
        </div>
        <p className="mx-auto mt-6 max-w-lg px-5 text-center text-[11px] leading-relaxed text-[var(--color-muted)]">
          Open source under the MIT License. Not affiliated with OpenAI. You are
          responsible for accuracy in your applications.
        </p>
      </footer>
    </div>
  );
}
