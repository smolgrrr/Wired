import { useState, useEffect } from "react";
import { generateSecretKey, getPublicKey, finalizeEvent, UnsignedEvent } from "nostr-tools";
import { publish } from "../../utils/relays";

const useWorkers = (numCores: number, unsigned: UnsignedEvent, difficulty: string, deps: any[]) => {
    const [messageFromWorker, setMessageFromWorker] = useState(null);
    const [hashrate, setHashrate] = useState(0);
    const [bestPow, setBestPow] = useState(0);

    const startTime = Date.now();

    const startWork = () => {
        const workers = Array(numCores).fill(null).map(() => new Worker(new URL("../../powWorker", import.meta.url)));

        workers.forEach((worker, index) => {
            worker.onmessage = (event) => {
                if (event.data.status === 'progress') {
                    setHashrate(Math.floor(event.data.currentNonce/((Date.now() - startTime)/1000)));
                    if (event.data.bestPoW > bestPow) {
                        setBestPow(event.data.bestPoW)
                    }
                } else if (event.data.found) {
                    setMessageFromWorker(event.data.event);
                    // Terminate all workers once a solution is found
                    workers.forEach(w => w.terminate());
                }
            };

            worker.postMessage({
                unsigned,
                difficulty,
                nonceStart: index, // Each worker starts from its index
                nonceStep: numCores  // Each worker increments by the total number of workers
            });
        });
    };

    return { startWork, messageFromWorker, hashrate, bestPow };
};

export const useSubmitForm = (unsigned: UnsignedEvent, difficulty: string) => {
    const [doingWorkProp, setDoingWorkProp] = useState(false);
    const [sk, setSk] = useState(generateSecretKey());
    const unsignedWithPubkey = { ...unsigned, pubkey: getPublicKey(sk) };
    const powServer = useState(localStorage.getItem('powserver') || '');
    const [unsignedPoWEvent, setUnsignedPoWEvent] = useState<UnsignedEvent>()
    let storedKeys = JSON.parse(localStorage.getItem('usedKeys') || '[]');

    // Initialize the worker outside of any effects
    const numCores = navigator.hardwareConcurrency || 4;

    const { startWork, messageFromWorker, hashrate, bestPow } = useWorkers(numCores, unsignedWithPubkey, difficulty, [unsignedWithPubkey]);

    useEffect(() => {
        if (unsignedPoWEvent) {
            setDoingWorkProp(false);
            const signedEvent = finalizeEvent(unsignedPoWEvent, sk);
            publish(signedEvent);
            setSk(generateSecretKey())
        } 
    }, [unsignedPoWEvent]);

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        setDoingWorkProp(true);
        console.log(powServer[0])
        if (powServer[0]) {
            const inEventFormat = { ...unsignedWithPubkey, sig: "" };
            const powRequest = {
                req_event: inEventFormat,
                difficulty: difficulty
            };
        
            fetch(`${powServer[0]}/powgen`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(powRequest)
            })
            .then(response => response.json())
            .then(data => {
                console.log(data);
                // handle the response data
                setUnsignedPoWEvent(data.event)
            })
            .catch(error => {
                console.error('Error:', error);
            });
            
        } else {
            startWork();
        }

        // Add the logic here
        storedKeys.push([sk, getPublicKey(sk)]);
        // Stringify the array and store it back to localStorage
        localStorage.setItem('usedKeys', JSON.stringify(storedKeys));
    };

    useEffect(() => {
        if (messageFromWorker) {
            setUnsignedPoWEvent(messageFromWorker);
        }
    }, [messageFromWorker]);

    return { handleSubmit, doingWorkProp, hashrate, bestPow };
};