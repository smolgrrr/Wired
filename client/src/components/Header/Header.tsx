import { Cog6ToothIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';

export default function Header() {
    return (
        <header className="hidden lg:block text-white p-4">
            <div className="container mx-auto flex justify-between items-center">
                <a href='/'>
                <div className="flex items-center">
                    <img src="tao.png" className="h-8" />
                    <span className="font-bold">The Anon Operation</span>
                </div>
                </a>
                <button className="ml-auto pr-4">
                    <QuestionMarkCircleIcon className="h-6 w-6 text-transperant" />
                </button>
                <a href='/settings'>
                <button className="">
                    <Cog6ToothIcon className="h-6 w-6 text-transperant" />
                </button>
                </a>
            </div>
        </header>
    );
}