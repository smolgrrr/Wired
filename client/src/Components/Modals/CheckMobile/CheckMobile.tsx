import React, { useState, useEffect } from 'react';
import { XMarkIcon } from "@heroicons/react/24/solid";
import { ArrowUpOnSquareIcon, PlusCircleIcon } from '@heroicons/react/24/outline';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';

declare global {
    interface Navigator {
        standalone?: boolean;
    }
}

const AddToHomeScreenPrompt: React.FC = () => {
    const [inMobileBrowser, setInMobileBrowser] = useState(false);

    useEffect(() => {
        const checkPWA = () => {
            // Check if the app is running as a PWA on Android
            const isAndroidPWA = window.matchMedia('(display-mode: standalone)').matches ||
                window.matchMedia('(display-mode: minimal-ui)').matches;

            // Check if the app is running as a PWA on other platforms
            const isOtherPWA = window.navigator.standalone;

            return !isAndroidPWA && !isOtherPWA;
        };

        // Function to detect mobile browser
        const detectMobileBrowser = () => {
            return (
                (navigator.userAgent.match(/Android/i) ||
                navigator.userAgent.match(/webOS/i) ||
                navigator.userAgent.match(/iPhone/i) ||
                navigator.userAgent.match(/iPad/i) ||
                navigator.userAgent.match(/iPod/i) ||
                navigator.userAgent.match(/Windows Phone/i))
            );
        };

        const timer = setTimeout(() => {
            setInMobileBrowser(Boolean(checkPWA() && detectMobileBrowser()));
        }, 2000); // 3000 milliseconds = 3 seconds

        // Cleanup function to clear the timeout if the component unmounts before the timeout finishes
        return () => clearTimeout(timer);
    }, []);

    if (!inMobileBrowser) {
        return null;
    }

    return (
        <Transition appear show={inMobileBrowser} as={Fragment}>
            <Dialog
                as="div"
                className="fixed inset-0 z-10 overflow-y-auto"
                onClose={() => setInMobileBrowser(false)}
            >
                <div className="min-h-screen px-4 text-center">
                    <Dialog.Overlay className="fixed inset-0 bg-gray-800 opacity-40" />

                    <span
                        className="inline-block h-screen align-middle"
                        aria-hidden="true"
                    >
                        &#8203;
                    </span>
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-neutral-900 rounded-lg m-2 border border-neutral-700 shadow-md flex justify-between items-center animate-slide-up">
                <div className="flex flex-col text-white">
                    <span className="font-semibold">Stay Wired</span>
                    <p className="text-xs">Add Wired to your home screen for a better experience</p>
                    <ul className="list-none mt-2 text-sm">
                        <li>
                            <div className="flex items-center">
                                <span className="mr-2">{'>'}</span> Click on <ArrowUpOnSquareIcon className="h-6 w-6 ml-1 text-blue-500" /> <span className="font-semibold text-blue-500">Share</span>
                            </div>
                        </li>
                        <li>
                            <div className="flex items-center">
                                <span className="mr-2">{'>'}</span> Click <PlusCircleIcon className="h-6 w-6 ml-1 text-blue-500" /> <span className="font-semibold text-blue-500">Add to Home Screen</span>
                            </div>
                        </li>
                    </ul>
                </div>
                <button className="absolute top-2 right-2" onClick={() => {setInMobileBrowser(!inMobileBrowser);}}>
                    <XMarkIcon className="h-6 w-6 text-white" />
                </button>
                </div>
                </div>
            </Dialog>
        </Transition>
    );
};

export default AddToHomeScreenPrompt;
