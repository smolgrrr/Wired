import { useMemo, useEffect } from 'react';

interface Dispatch {
    (arg: { type: string, payload?: any }): void
}

const useWorkers = (dispatch: Dispatch) => {
    const numCores = navigator.hardwareConcurrency || 4;

    const workers = useMemo(
        () => Array(numCores).fill(null).map(() => new Worker(new URL("../../powWorker", import.meta.url))),
        []
    );

    useEffect(() => {
        workers.forEach((worker) => {
            worker.onmessage = (event) => {
                if (event.data.status === 'progress') {
                    dispatch({ type: 'SET_WORK_PROGRESS', payload: event.data.currentNonce });
                } else if (event.data.found) {
                    dispatch({ type: 'SET_MESSAGE_FROM_WORKER', payload: event.data.event });
                    workers.forEach(w => w.terminate());
                }
            };
        });

        const handleDifficultyChange = (event: Event) => {
            const customEvent = event as CustomEvent;
            dispatch({ type: 'SET_DIFFICULTY', payload: customEvent.detail });
        };

        window.addEventListener('difficultyChanged', handleDifficultyChange);

        return () => {
            window.removeEventListener('difficultyChanged', handleDifficultyChange);
        };
    }, []);

    return workers;
};

export default useWorkers;