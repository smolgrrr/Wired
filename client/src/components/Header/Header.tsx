import { CogIcon } from '@heroicons/react/24/outline';

export default function Header() {
    return (
        <footer className="fixed bottom-0 z-20 w-full bg-gradient-to-r from-blue-900 to-cyan-500 shadow-lg shadow-black">
            <div className="flex justify-end items-center h-14"> {/* Adjust height as needed */}
                <button tabIndex={0} className="p-4">
                    <CogIcon className="h-12 w-12 text-transperant" />
                </button>
            </div>
        </footer>
    );
}