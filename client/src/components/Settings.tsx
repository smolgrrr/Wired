import React, { useState } from 'react';
// import {powEvent} from './system';
// import {publish} from './relays';

const Settings = () => {
  const [filterDifficulty, setFilterDifficulty] = useState(localStorage.getItem('filterDifficulty') || 20);
  const [difficulty, setDifficulty] = useState(localStorage.getItem('difficulty') || 20);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('filterDifficulty', String(filterDifficulty));
    localStorage.setItem('difficulty', String(difficulty));
  };

  return (
<div className="settings-page bg-black text-white min-h-screen p-8">
  <h1 className="text-lg font-semibold mb-4">Settings</h1>
  <form onSubmit={handleSubmit}>
    <div className="flex flex-wrap -mx-2 mb-4">
      <div className="w-full md:w-1/3 px-2 mb-4 md:mb-0">
        <label className="block mb-2" htmlFor="filterDifficulty">
          Filter Difficulty:
        </label>
        <input 
          id="filterDifficulty"
          type="number"
          value={filterDifficulty}
          onChange={e => setFilterDifficulty(e.target.value)}
          className="w-full px-3 py-2 border rounded-md text-black"
        />
      </div>

      <div className="w-full md:w-1/3 px-2 mb-4 md:mb-0">
        <label className="block mb-2" htmlFor="difficulty">
          Post Difficulty:
        </label>
        <input 
          id="difficulty"
          type="number"
          value={difficulty}
          onChange={e => setDifficulty(e.target.value)}
          className="w-full px-3 py-2 border rounded-md text-black"
        />
      </div>
    </div>
    <button className="bg-gradient-to-r from-blue-900 to-cyan-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
      Save Settings
    </button>
  </form>
</div>

  );
};

export default Settings;
