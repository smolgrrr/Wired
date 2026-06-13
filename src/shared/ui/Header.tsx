import { Link, useLocation } from "react-router-dom";
import { getPathDisplay } from "./routeLabelMap";

function NavLink({
  to,
  label,
  isActive,
}: {
  to: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      to={to}
      aria-current={isActive ? "page" : undefined}
      className={[
        "text-meta transition-colors duration-hover border-b-2 pb-0.5",
        isActive
          ? "text-signal font-medium border-signal"
          : "text-secondary border-transparent hover:text-primary",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export function Header() {
  const { pathname } = useLocation();
  const pathDisplay = getPathDisplay(pathname);

  return (
    <header className="mx-auto px-4 sm:px-6 lg:px-8 h-[var(--header-height)] flex items-center border-b border-ghost">
      <a
        href="#main-content"
        className="sr-only focus:fixed focus:left-4 focus:top-2 focus:z-[10000] focus:m-0 focus:h-auto focus:w-auto focus:overflow-visible focus:whitespace-normal focus:rounded-sm focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-meta focus:text-primary"
      >
        skip to content
      </a>
      <div className="flex w-full items-center justify-between gap-4">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-1 truncate focus-visible:outline-none"
          title={`signal ${pathDisplay}`}
        >
          <span className="text-meta text-secondary shrink-0">signal</span>
          <span className="text-meta text-signal font-medium truncate border-b-2 border-signal pb-0.5">
            {pathDisplay}
          </span>
        </Link>
        <nav className="flex shrink-0 gap-4" aria-label="Primary navigation">
          <NavLink
            to="/notifications"
            label="activity"
            isActive={pathname === "/notifications"}
          />
          <NavLink
            to="/settings"
            label="settings"
            isActive={pathname === "/settings"}
          />
        </nav>
      </div>
    </header>
  );
}