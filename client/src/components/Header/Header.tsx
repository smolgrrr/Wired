import {
  Cog6ToothIcon,
  BellIcon,
  ArchiveBoxIcon
} from "@heroicons/react/24/outline";

export default function Header() {
  return (
    <header className="mx-auto px-4 sm:px-6 lg:px-8 py-2">
      <div className="flex justify-between items-center">
        <a href="/">
          <div className="flex items-center gap-2">
            <img src="/icon.png" className="h-12" alt="logo" />
            <span className="font-semibold text-white">
            {"~\\WIRED>"}
            </span>
          </div>
        </a>
        <div>
        <a
          href="/boards"
          className="text-neutral-300 inline-flex gap-4 items-center"
        >
          <button>
            <ArchiveBoxIcon className="h-5 w-5" />
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
