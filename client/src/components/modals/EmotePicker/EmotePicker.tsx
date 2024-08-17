import React, { useState } from 'react';
import emotes from './custom_emojis.json';
import { PlusCircleIcon } from '@heroicons/react/24/outline';

const EmotePicker = () => {
    const [showEmotes, setShowEmotes] = useState(false);

    const toggleEmotes = () => {
        setShowEmotes(!showEmotes);
    };

    return (
        <>
            <PlusCircleIcon className="h-4 w-4 text-neutral-400 cursor-pointer" onClick={toggleEmotes} />
            {showEmotes && (
                <div className="flex flex-wrap mt-2 border">
                {emotes.slice(0, 20).map((emote, index) => (
                    <div key={index} className="w-1/5 p-1 text-center">
                        <img src={emote.static_url} alt={emote.shortcode} className="w-5 h-5" />
                    </div>
                ))}
            </div>
            )}
        </>
    );
};

export default EmotePicker;
