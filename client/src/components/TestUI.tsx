import { useState } from "react";
import Placeholder from "./Modals/Placeholder";
import OptionsBar from "./Modals/OptionsBar";

const TestUI = () => {
    const [sortByTime, setSortByTime] = useState(true);

    const toggleSort = () => {
        setSortByTime(prev => !prev);
    };
        return (
            <>
                <Placeholder />
                <div className="col-span-full h-0.5 bg-neutral-900"/> {/* This is the white line separator */}
                <OptionsBar sortByTime={sortByTime} toggleSort={toggleSort} />
            </>
        );
    
};

export default TestUI;