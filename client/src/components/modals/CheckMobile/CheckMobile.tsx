import React, { useState, useEffect, Fragment } from 'react';
import { XMarkIcon, ArrowUpOnSquareIcon, PlusCircleIcon } from "@heroicons/react/24/outline";
import { Dialog, Transition } from '@headlessui/react';

declare global {
    interface Navigator {
        standalone?: boolean;
    }
}

export default function CombinedIntroAndMobile() {
    const [showIntro, setShowIntro] = useState(false);
    const [inMobileBrowser, setInMobileBrowser] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            const hasClosedIntro = localStorage.getItem('hasClosedIntro') !== 'true';
            setShowIntro(hasClosedIntro);

            const checkPWA = () => {
                const isAndroidPWA = window.matchMedia('(display-mode: standalone)').matches ||
                    window.matchMedia('(display-mode: minimal-ui)').matches;
                const isOtherPWA = window.navigator.standalone;
                return !isAndroidPWA && !isOtherPWA;
            };

            const detectMobileBrowser = () => {
                return /Android|webOS|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
            };

            setInMobileBrowser(checkPWA() && detectMobileBrowser());
        }, 2000);

        return () => clearTimeout(timer);
    }, []);

    const handleClose = () => {
        setShowIntro(false);
        localStorage.setItem('hasClosedIntro', 'true');
    };

    if (!showIntro && !inMobileBrowser) return null;

    return (
        <Transition appear show={showIntro || inMobileBrowser} as={Fragment}>
            <Dialog
                as="div"
                className="fixed inset-0 z-10 overflow-y-auto"
                onClose={handleClose}
            >
                <div className="min-h-screen px-4 text-center">
                    <Dialog.Overlay className="fixed inset-0 bg-gray-800 opacity-40" />
                    <span className="inline-block h-screen align-middle" aria-hidden="true">&#8203;</span>
                    <div className="inline-block w-full text-white max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-neutral-900 shadow-xl rounded-2xl">
                        {showIntro && (
                            <div className="mb-4">
                                <h2 className="text-lg font-bold mb-4 flex items-center">
                                    Welcome to The Wired
                                    <img src="https://poa.st/emoji/custom/lainsmile.png" className="h-8 ml-2" alt="Lain smile" />
                                </h2>
                                <ul className="list-none space-y-2 text-xs">
                                    <li>
                                        {'>'} Here your anonymous posts are distributed among a series of independent <a className="underline" href="https://github.com/nostr-protocol/nostr" target="_blank" rel="noopener noreferrer">NOSTR</a> relay servers,
                                        which means they are highly resistant to censorship and moderation.
                                    </li>
                                    <li>
                                        {'>'} Each post must use Proof-of-Work to reduce spam and noise. Your note's ID is a hash of the note,
                                        and this hashing is done repeatedly with a nonce until it starts with multiple leading zeros,
                                        which approximates the work done to generate the note.
                                    </li>
                                </ul>
                            </div>
                        )}
                        {inMobileBrowser && (
                            <div className="mt-4">
                                <p className="text-xs mb-2">Add Wired to your home screen for a better experience</p>
                                <ul className="list-none text-sm">
                                    <li className="flex items-center">
                                        <span className="mr-2">{'>'}</span> Click on <ArrowUpOnSquareIcon className="h-6 w-6 ml-1 text-blue-500" /> <span className="font-semibold text-blue-500">Share</span>
                                    </li>
                                    <li className="flex items-center">
                                        <span className="mr-2">{'>'}</span> Click <PlusCircleIcon className="h-6 w-6 ml-1 text-blue-500" /> <span className="font-semibold text-blue-500">Add to Home Screen</span>
                                    </li>
                                </ul>
                            </div>
                        )}
                        <button
                            className="absolute top-2 right-2 text-neutral-400 hover:text-neutral-200"
                            onClick={handleClose}
                        >
                            <XMarkIcon className="h-6 w-6" />
                        </button>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
}
