import { Link, useLocation } from "react-router-dom";

export function Header() {
  const location = useLocation();
  const pathParts = location.pathname.split("/");
  const secondLastPart = pathParts[pathParts.length - 2];
  const lastPathPart = secondLastPart === "thread" ? "/thread" : "/" + pathParts[pathParts.length - 1];

  return (
    <header className="mx-auto px-4 sm:px-6 lg:px-8 py-2">
      <div className="flex justify-between items-center">
        <Link to="/">
          <div className="flex items-center gap-2 max-w-60 w-full sm:max-w-none sm:w-auto">
            <span className="font-semibold text-white truncate">
              {`~/WIRED${lastPathPart}>`}
            </span>
          </div>
        </Link>
        <nav className="flex gap-4 text-xs text-neutral-300" aria-label="Primary navigation">
          <Link to="/notifications">Activity</Link>
          <Link to="/settings">Settings</Link>
        </nav>
      </div>
    </header>
  );
}