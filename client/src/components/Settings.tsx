import React, { useEffect, useState } from 'react';
// import {powEvent} from './system';
// import {publish} from './relays';
import { addRelay } from '../utils/relays';
import { CpuChipIcon } from '@heroicons/react/24/outline';
const Settings = () => {
  const [filterDifficulty, setFilterDifficulty] = useState(localStorage.getItem('filterDifficulty') || 20);
  const [difficulty, setDifficulty] = useState(localStorage.getItem('difficulty') || 21);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('filterDifficulty', String(filterDifficulty));
    localStorage.setItem('difficulty', String(difficulty));

    const eventData = {
      difficulty: String(difficulty),
      filterDifficulty: String(filterDifficulty),
    };
    const event = new CustomEvent('settingsChanged', { detail: eventData });
    window.dispatchEvent(event);
  };

  return (
    <div className="settings-page bg-black text-white p-8 flex flex-col h-full">
      <h1 className="text-lg font-semibold mb-4">Settings</h1>
      <form onSubmit={handleSubmit}>
        <div className="flex flex-wrap -mx-2 mb-4">
          <div className="w-full md:w-1/3 px-2 mb-4 md:mb-0">
            <label className="block text-xs mb-2" htmlFor="filterDifficulty">
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                Proof-of-Work Difficulty Filter {'('}<CpuChipIcon className="h-4 w-4" />{'>'}X to appear on feed{')'}:
              </span>
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
            <label className="block text-xs mb-2" htmlFor="difficulty">
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                Post Difficulty {'('}<CpuChipIcon className="h-4 w-4" /> required to make post{')'}:
              </span>
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

      <div className="settings-page py-10">
        <h1 className="text-lg font-semibold mb-4">About</h1>
        <div className="flex flex-col">
          <p>The Anon Operation (TAO) is an anonymous-first agora, built upon the <a className="underline" href="https://nostr.com/">NOSTR protocol</a>.</p>
          <br />
          <p>TAO is built to facilitate unstoppable free speech on the internet.</p>
          <p>-PWA to be widely accessible with distribution via URLS, and to side-step App Store gatekeeping</p>
          <p>-Uses NOSTR as a censorship-resistant global "social" network</p>
          <p>-Employs Proof-of-Work (PoW) as a spam prevention mechanism, as opposed to Captcha, moderation or other verification methods</p>
          <br />
          <a href="https://github.com/smolgrrr/TAO">
            <img src="https://img.shields.io/github/stars/smolgrrr/TAO.svg?style=social" alt="Github Stars Badge" />
          </a>
          <div>
            <span>Found a bug? dm me: <a className="underline" href="https://njump.me/npub13azv2cf3kd3xdzcwqxlgcudjg7r9nzak37usnn7h374lkpvd6rcq4k8m54">doot</a> or <a className="underline" href="mailto:smolgrrr@protonmail.com">smolgrrr@protonmail.com</a></span>
            <img className="h-16" src="doot.jpeg"/>
          </div>
        </div>
      </div>
      <img className="block sm:hidden h-20 mx-auto mt-auto" src="/pepe.png"/>
    </div>

  );
};

export default Settings;
