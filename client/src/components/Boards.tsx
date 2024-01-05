import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Boards = () => {
    const navigate = useNavigate();
    const addedBoards = JSON.parse(localStorage.getItem('addedBoards') as string) || [];
    const [boardName, setBoardName] = useState('');
    const [boardPubkey, setboardPubkey] = useState('')

    const DefaultBoards = [['bitcoin', 'npub19nrn4l0s39kpwww7pgk9jddj8lzekqxmtrll8r2a57chtq3zx6sq00vetn']];

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        addedBoards.push([boardName, boardPubkey])
        localStorage.setItem('addedBoards', String(addedBoards));
    };

    return (
        <div className="settings-page bg-black text-white p-8 flex flex-col h-full">
            <h1 className="text-lg font-semibold mb-4">Boards</h1>
            <div className="">
                {/* Map over DefaultBoards and addedBoards and display them */}
                <ul className='py-4'>
                    {DefaultBoards.map((board, index) => (
                        <li key={index}><a href={`/board/${board[1]}`}>/{board[0]}/</a></li>
                    ))}
                    {addedBoards.map((board: string, index: number) => (
                        <li key={index}><a href={`/board/${board[1]}`}>/{board[0]}/</a></li>
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
                </form>
            </div>
        </div>
    );
};

export default Boards;
