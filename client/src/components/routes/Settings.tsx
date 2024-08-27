import React, { useState } from 'react';
import { CpuChipIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

type TestResponse = {
  timeTaken: string;
  hashrate: string;
};

const Settings = () => {
  const [filterDifficulty, setFilterDifficulty] = useState(localStorage.getItem('filterDifficulty') || 21);
  const [difficulty, setDifficulty] = useState(localStorage.getItem('difficulty') || 21);
  const [age, setAge] = useState(localStorage.getItem('age') || 24);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [powServer, setPowServer] = useState(localStorage.getItem('powserver') || '');
  const [testDiff, setTestDiff] = useState('21')
  const [testResult, setTestResult] = useState<TestResponse>()
  const [noteLink, setNoteLink] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('filterDifficulty', String(filterDifficulty));
    localStorage.setItem('difficulty', String(difficulty));
    localStorage.setItem('powserver', String(powServer));
    localStorage.setItem('age', String(age));

    const eventData = {
      difficulty: String(difficulty),
      filterDifficulty: String(filterDifficulty),
      powServer: String(powServer),
      age: String(age),
    };
    const event = new CustomEvent('settingsChanged', { detail: eventData });
    window.dispatchEvent(event);
  };
  console.log(powServer)

  const handleTest = () => {
    setTestResult({ timeTaken: '...', hashrate: '...' });
    console.log(powServer[0])
    if (powServer[0]) {
      const testRequest = {
        Difficulty: testDiff
      };

      fetch(`${powServer}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testRequest)
      })
        .then(response => response.json())
        .then(data => {
          console.log(data);
          // handle the response data
          setTestResult(data)
        })
        .catch(error => {
          console.error('Error:', error);
        });
    }
  };

  return (
    <div className="settings-page bg-black text-white p-8 flex flex-col h-full">
      <h1 className="text-lg font-semibold mb-4">Settings</h1>
      <form onSubmit={handleSubmit}>
        <div className="flex flex-wrap -mx-2 mb-4">
          <div className="w-full md:w-1/3 px-2 mb-4 md:mb-0">
            <label className="block text-xs mb-2" htmlFor="filterDifficulty">
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                Proof-of-Work Filter:
              </span>
            </label>
            <input
              id="filterDifficulty"
              type="number"
              value={filterDifficulty}
              onChange={e => setFilterDifficulty(e.target.value)}
              min={21}
              className="w-full px-3 py-2 border rounded-md bg-black"
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
              min={21}
              className="w-full px-3 py-2 border rounded-md bg-black"
            />
          </div>
          <div className="w-full md:w-1/3 px-2 mb-4 md:mb-0">
            <label className="block text-xs mb-2" htmlFor="difficulty">
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                Thread Age Limit (hrs):
              </span>
            </label>
            <input
              id="age"
              type="number"
              value={age}
              onChange={e => setAge(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-black"
            />
          </div>
        </div>
        <div className='pb-4'>
          <span onClick={() => setShowAdvancedSettings(!showAdvancedSettings)} className="">
            {">"} Advanced Settings
          </span>
          {showAdvancedSettings && (
            <><div className={`transition-height duration-200 ease-in-out overflow-hidden ${showAdvancedSettings ? 'h-auto' : 'h-0'} w-full md:w-1/3 px-2 mb-4 md:mb-0`}>
              <label className="block text-xs mb-2" htmlFor="powServer">
                Remote PoW Server:
              </label>
              <input
                id="powServer"
                type="text"
                value={powServer}
                onChange={e => setPowServer(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-black"
              />
            </div>
              <div className="px-2">
                <label className="block text-xs mb-2" htmlFor="powServer">
                  Test Your PoW Server (difficulty):
                </label>
                <input
                  id="testAPI"
                  type="text"
                  value={testDiff}
                  onChange={e => setTestDiff(e.target.value)}
                  className="w-12 px-3 py-2 border rounded-md bg-black"
                />
                <button type="button" onClick={handleTest} className="bg-black border text-white font-bold py-2 px-4 rounded">
                  Test
                </button>
                {testResult && (
                  <span>Time: {testResult.timeTaken}s with a hashrate of {testResult.hashrate}</span>
                )}
              </div>
              </>
              )}
        </div>
        <button
          type="submit"
          className="bg-black border text-white font-bold py-2 px-4 rounded">
          Save Settings
        </button>
      </form>
      <div className="settings-page pt-10">
        <h1 className="text-lg font-semibold mb-4">Open Note</h1>
        <form onSubmit={(e) => {e.preventDefault(); navigate(`/thread/${noteLink}`);}}>
        <div className="flex flex-wrap -mx-2 mb-4">
          <div className="w-full md:w-1/3 px-2 mb-4 md:mb-0">
            <label className="block text-xs mb-2" htmlFor="filterDifficulty">
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                Note ID:
              </span>
            </label>
            <input
              id="noteIDinput"
              type="string"
              value={noteLink}
              onChange={e => setNoteLink(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-black"
            />
          </div>
        </div>
        <button
          type="submit"
          className="bg-black border text-white font-bold py-2 px-4 rounded">
          Open
        </button>
      </form>
      </div>
      <div className="settings-page py-10">
        <h1 className="text-lg font-semibold mb-4">About <a className="hover:underline"href="https://git.getwired.app/doot/TAO">(source code)</a></h1>
        <div className="flex flex-col">
          <p>The Wired is an anon agora, built upon the <a className="underline" href="https://nostr.com/">NOSTR protocol</a>.</p>
          <br />
          <p>The Wired is built to facilitate unstoppable free speech on the internet.</p>
          <p>-PWA to be widely accessible with distribution via URLS, and to side-step App Store gatekeeping</p>
          <p>-Uses NOSTR as a censorship-resistant "social" network</p>
          <p>-Employs Proof-of-Work (PoW) as a spam prevention mechanism, as opposed to Captcha, moderation or other verification methods</p>
          <br />
          <a href="https://github.com/smolgrrr/TAO">
            <img src="https://img.shields.io/github/stars/smolgrrr/TAO.svg?style=social" alt="Github Stars Badge" />
          </a>
          <div>
            <span>Found a bug? dm me: <a className="underline" href="https://njump.me/npub13azv2cf3kd3xdzcwqxlgcudjg7r9nzak37usnn7h374lkpvd6rcq4k8m54">doot</a> or <a className="underline" href="mailto:smolgrrr@protonmail.com">smolgrrr@protonmail.com</a></span>
            <img className="h-16" src="doot.jpeg" />
          </div>
        </div>
      </div>
    </div>

  );
};

export default Settings;
