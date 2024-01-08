import React, { useState } from 'react';

export const DefaultBoards = [
    ['Bitcoin', 'npub19nrn4l0s39kpwww7pgk9jddj8lzekqxmtrll8r2a57chtq3zx6sq00vetn', 'btc'],
    ['Technology', 'npub1mltf3r3tskdxfjlq6ltt2n73xs29wcza3sjfw75ggxz3p8fpcg4qe44h9v', 'g'],
    ['Television & Film', 'npub1cpeuaea3cymx42fmmx2ur82t5qnckqv85qy5q2nhzhxwzael5v4sksfe29', 'tv'],
    ['Vidya', 'npub19t2dt6deqaleq59fdaq576tnqdzwkyzwptxfa2tck0v66w29xagqe7yqll', 'v'],
    ['Politically Incorrect', 'npub19znf32s8s7qpkpfrck0suyym3m3wtrwpnldj76u0qwjtms3dcftsqs6r87', 'pol']
];

const Boards = () => {
    const [addedBoards, setAddedBoards] = useState<string[][]>(JSON.parse(localStorage.getItem('addedBoards') as string) || []);
    const [boardName, setBoardName] = useState('');
    const [boardPubkey, setboardPubkey] = useState('')

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const newBoards = [...addedBoards, [boardName, boardPubkey]];
        setAddedBoards(newBoards);
        localStorage.setItem('addedBoards', JSON.stringify(newBoards));
    };

    const clearBoards = () => {
        localStorage.setItem('addedBoards', JSON.stringify([]));
        setAddedBoards([]);
    };

    return (
        <div className="settings-page bg-black text-white p-8 flex flex-col h-full">
            <h1 className="text-lg font-semibold mb-4">Boards</h1>
            <div className="">
                {/* Map over DefaultBoards and addedBoards and display them */}
                <ul className='py-4'>
                    {DefaultBoards.map((board, index) => (
                        <li key={index}><a href={`/board/${board[1]}`} className='hover:underline'>/{board[0]}/</a></li>
                    ))}
                    {addedBoards.map((board: string[], index: number) => (
                        <li key={index}><a href={`/board/${board[1]}`} className='hover:underline'>/{board[0]}/</a></li>
                    ))}
                </ul>

                <form onSubmit={handleSubmit}>
                    <div className="flex flex-wrap -mx-2 my-4">
                        <div className="w-full md:w-1/3 px-2 mb-4 md:mb-0">
                            <label className="block text-xs mb-2" htmlFor="difficulty">
                                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                    Add Board
                                </span>
                            </label>
                            <div className="flex">
                                <input
                                    id="BoardName"
                                    type="string"
                                    placeholder={'Board Name'}
                                    onChange={e => setBoardName(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-md bg-black"
                                />
                                <input
                                    id="BoardPubkey"
                                    type="string"
                                    placeholder={'Board Pubkey'}
                                    onChange={e => setboardPubkey(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-md bg-black"
                                />
                            </div>
                        </div>
                    </div>
                    <button
                        type="submit"
                        className="bg-black border text-white font-bold py-2 px-4 rounded">
                        Add Board
                    </button>
                    <button
                        type="button"
                        onClick={clearBoards}
                        className="bg-black border text-white font-bold py-2 px-4 rounded mx-4">
                        Clear
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Boards;
