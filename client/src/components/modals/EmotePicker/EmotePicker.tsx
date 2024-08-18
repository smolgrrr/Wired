import React, { useState, useRef, useEffect } from 'react';
import emotes from './custom_emojis.json';
import { PlusCircleIcon } from '@heroicons/react/24/outline';

interface Emoji {
    category: string;
    shortcode: string;
    static_url: string;
    tags: string[];
    url: string;
    visible_in_picker: boolean;
}

interface EmotePickerProps {
    onEmojiSelect?: (emoji: Emoji) => void;
}

const EmotePicker: React.FC<EmotePickerProps> = ({ onEmojiSelect }) => {
    const [showEmotes, setShowEmotes] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [hoveredEmote, setHoveredEmote] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState(0);
    const modalRef = useRef<HTMLDivElement>(null);

    const toggleEmotes = () => {
        setShowEmotes(!showEmotes);
    };

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
    };

    const categories = [
        { label: '0-4', range: /^[0-4]/ },
        { label: '5-9', range: /^[5-9]/ },
        { label: 'A-E', range: /^[A-E]/i },
        { label: 'F-J', range: /^[F-J]/i },
        { label: 'K-N', range: /^[K-N]/i },
        { label: 'O-R', range: /^[O-R]/i },
        { label: 'S-V', range: /^[S-V]/i },
        { label: 'W-Z', range: /^[W-Z]/i },
    ];

    const filteredEmotes = emotes.filter((emote) => {
        const matchesSearch = emote.shortcode.toLowerCase().includes(searchQuery.toLowerCase());
        if (searchQuery) {
            return matchesSearch;
        } else {
            const category = categories[activeTab];
            return matchesSearch && category.range.test(emote.shortcode);
        }
    });

    useEffect(() => {
        // Explicitly type the event parameter
        function handleClickOutside(event: MouseEvent) {
            // Use a type assertion to tell TypeScript the target is an HTMLElement
            const target = event.target as HTMLElement;
            if (modalRef.current && !modalRef.current.contains(target)) {
                setShowEmotes(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []); // Removed modalRef from dependency array as it doesn't change

    return (
        <div className="static m-auto">
            <PlusCircleIcon className="h-4 w-4 text-neutral-400 cursor-pointer" onClick={toggleEmotes} />
            {showEmotes && (
                <div ref={modalRef} className="absolute flex flex-wrap m-4 p-2 rounded-lg sm:w-full md:w-full lg:w-1/4 bg-[#151617] max-h-64 overflow-y-auto max-w-full right-0 left-0 mx-auto">
                    <input
                        type="text"
                        placeholder="Search emotes..."
                        value={searchQuery}
                        onChange={handleSearch}
                        className="w-full mb-2 h-10 px-4 py-2 bg-gray-900 rounded-md shadow-sm focus:outline-none focus:border-blue-500"
                    />
                    <div className="flex w-full mb-2">
                        {categories.map((category, index) => (
                            <button
                                type="button"
                                key={index}
                                className={`text-xs px-2 py-1 rounded-md ${activeTab === index ? 'bg-gray-700' : 'bg-gray-600'
                                    }`}
                                onClick={() => setActiveTab(index)}
                            >
                                {category.label}
                            </button>
                        ))}
                    </div>
                    {filteredEmotes.map((emote: Emoji, index) => (
                        <div
                            key={index}
                            className="text-center relative"
                            onMouseEnter={() => setHoveredEmote(emote.shortcode)}
                            onMouseLeave={() => setHoveredEmote(null)}
                            onClick={() => onEmojiSelect && onEmojiSelect(emote)} // Add this line
                        >
                            <img src={emote.static_url} className="w-7 m-1" />
                            {hoveredEmote === emote.shortcode && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 bg-gray-800 text-white px-2 py-1 rounded-md">
                                    {emote.shortcode}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default EmotePicker;