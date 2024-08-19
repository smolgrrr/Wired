import {
  Cog6ToothIcon,
  BellIcon,
  HashtagIcon
} from "@heroicons/react/24/outline";
import { useLocation } from "react-router-dom";

export default function Header() {
  const location = useLocation();
  const pathParts = location.pathname.split('/');
  const secondLastPart = pathParts[pathParts.length - 2];
  const lastPathPart = secondLastPart === "thread" ? "/thread" : "/" + pathParts[pathParts.length - 1];

  return (
    <header className="mx-auto px-4 sm:px-6 lg:px-8 py-2">
      <div className="flex justify-between items-center">
        <a href="/">
            <div className="flex items-center gap-2 max-w-60 w-full sm:max-w-none sm:w-auto">
            <img src="/icon.png" className="h-12" alt="logo" />
              <span className="font-semibold text-white truncate">
                {`~/WIRED${lastPathPart}>`}
              </span>
          </div>
        </a>
        <div>
        <a
          href="/hashtags"
          className="text-neutral-300 inline-flex gap-4 items-center pl-4"
        >
          <button>
            <HashtagIcon className="h-5 w-5" />
          </button>
        </a>
        <a
          href="/notifications"
          className="text-neutral-300 inline-flex gap-4 items-center pl-4"
        >
          <button>
            <BellIcon className="h-5 w-5" />
          </button>
        </a>
        <a
          href="/settings"
          className="text-neutral-300 inline-flex gap-4 items-center pl-4"
        >
          <button>
            <Cog6ToothIcon className="h-5 w-5" />
          </button>
        </a>
        </div>
      </div>
    </header>
  );
}
