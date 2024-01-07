import {
  Cog6ToothIcon,
  BellIcon,
  ArchiveBoxIcon
} from "@heroicons/react/24/outline";
import { DefaultBoards } from "../Boards";

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
        <div className="hidden md:block">
          {DefaultBoards.map((board) => (
                        <a href={`/board/${board[1]}`} className='hover:underline text-neutral-600 text-xs pr-4'>/{board[2]}/</a>
                    ))}
      </div>
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
      <div className="block md:hidden flex justify-center ">
          {DefaultBoards.map((board) => (
                        <a href={`/board/${board[1]}`} className='hover:underline text-neutral-600 text-xs pr-4'>/{board[2]}/</a>
                    ))}
      </div>
    </header>
  );
}
