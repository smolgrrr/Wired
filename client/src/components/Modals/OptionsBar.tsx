import React from 'react';
import { useState } from 'react';

interface OptionsBarProps {
    sortByTime?: boolean;
    setAnon?: boolean;
    toggleSort?: () => void;
    toggleAnon?: () => void;
}

const OptionsBar: React.FC<OptionsBarProps> = ({ sortByTime, setAnon, toggleSort, toggleAnon }) => {
    const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

    return (
        <div className="px-8">
            <span onClick={() => setShowAdvancedSettings(!showAdvancedSettings)} className="text-xs text-neutral-600">
                {">"} Alter Feed
            </span>
            <div className={`transition-height duration-200 ease-in-out overflow-hidden ${showAdvancedSettings ? 'h-auto' : 'h-0'} flex w-full z-2`}>
                {toggleSort && <label htmlFor="toggleA" className="flex items-center cursor-pointer">
                    <div className="relative">
                        <input
                            id="toggleA"
                            type="checkbox"
                            className="sr-only"
                            checked={sortByTime}
                            onChange={toggleSort}
                        />
                        <div className="block bg-gray-600 w-8 h-4 rounded-full"></div>
                        <div className={`dot absolute left-1 top-0.5 bg-white w-3 h-3 rounded-full transition ${sortByTime ? 'transform translate-x-full bg-blue-400' : ''}`} ></div>
                    </div>
                    <div className={`ml-2 text-neutral-500 text-sm ${sortByTime ? 'text-neutral-500' : ''}`}>
                        {sortByTime ? 'Sort by Work' : 'Sort by Time'}
                    </div>
                </label>}
                {toggleAnon && <label htmlFor="toggleB" className="flex items-center cursor-pointer ml-4"> {/* Add margin-left here */}
                    <div className="relative">
                        <input
                            id="toggleB"
                            type="checkbox"
                            className="sr-only"
                            checked={setAnon}
                            onChange={toggleAnon}
                        />
                        <div className="block bg-gray-600 w-8 h-4 rounded-full"></div>
                        <div className={`dot absolute left-1 top-0.5 bg-white w-3 h-3 rounded-full transition ${setAnon ? 'transform translate-x-full bg-blue-400' : ''}`} ></div>
                    </div>
                    <div className={`ml-2 text-neutral-500 text-sm ${setAnon ? 'text-neutral-500' : ''}`}>
                        {setAnon ? 'Namefags' : 'Anon'}
                    </div>
                </label>}
            </div>
        </div>
    );
};

export default OptionsBar;