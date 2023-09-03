import { CogIcon } from '@heroicons/react/24/outline';

export default function Header() {
    return (
        <footer className="fixed bottom-0 z-20 w-full bg-gray-900 shadow-lg shadow-black">
                <label tabIndex={0} className="btn-ghost btn-circle btn">
                    <CogIcon className="h-24 w-24 text-white right-0" />
                </label>
        </footer>
    );
}