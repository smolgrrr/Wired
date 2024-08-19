import React, { useState } from 'react';

export const DefaultHashtags = ['asknostr', 'politics', 'technology', 'proofofwork','bitcoin', 'wired'];

const Hashtags = () => {
    const [addedHashtags, setAddedHashtags] = useState<string[]>(JSON.parse(localStorage.getItem('hashtags') as string) || []);
    const [newHashtag, setNewHashtag] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const newHashtagArray = [...addedHashtags, newHashtag];
        setAddedHashtags(newHashtagArray);
        localStorage.setItem('addedBoards', JSON.stringify(newHashtagArray));
    };

    const clearBoards = () => {
        localStorage.setItem('hashtags', JSON.stringify([]));
        setAddedHashtags([]);
    };

    return (
        <div className="settings-page bg-black text-white p-8 flex flex-col h-full">
            <h1 className="text-lg font-semibold mb-4">Saved hashtags</h1>
            <div className="">
                {/* Map over DefaultBoards and addedBoards and display them */}
                <ul className='py-4'>
                    {DefaultHashtags.map((hashtag, index) => (
                        <li key={index}><a href={`/hashtag/${hashtag}`} className='hover:underline'>#{hashtag}</a></li>
                    ))}
                    {addedHashtags.map((hashtag, index: number) => (
                        <li key={index}><a href={`/hashtag/${hashtag}`} className='hover:underline'>#{hashtag}</a></li>
                    ))}
                </ul>

                <form onSubmit={handleSubmit}>
                    <div className="flex flex-wrap -mx-2 my-4">
                        <div className="w-full md:w-1/3 px-2 mb-4 md:mb-0">
                            <label className="block text-xs mb-2" htmlFor="difficulty">
                                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                    Add Hashtag
                                </span>
                            </label>
                            <div className="flex">
                                <input
                                    id="hashtag"
                                    type="string"
                                    placeholder={'Hashtag'}
                                    onChange={e => setNewHashtag(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-md bg-black"
                                />
                            </div>
                        </div>
                    </div>
                    <button
                        type="submit"
                        className="bg-black border text-white font-bold py-2 px-4 rounded">
                        Submit
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

export default Hashtags;