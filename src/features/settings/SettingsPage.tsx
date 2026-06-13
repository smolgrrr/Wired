import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "../../app/settings";

type TestResponse = {
  timeTaken: string;
  hashrate: string;
};

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings();
  const [filterDifficulty, setFilterDifficulty] = useState(String(settings.filterDifficulty));
  const [difficulty, setDifficulty] = useState(String(settings.difficulty));
  const [age, setAge] = useState(String(settings.ageHours));
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [powServer, setPowServer] = useState(settings.powServerUrl);
  const [testDiff, setTestDiff] = useState("21");
  const [testResult, setTestResult] = useState<TestResponse>();
  const [noteLink, setNoteLink] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      filterDifficulty: Number(filterDifficulty),
      difficulty: Number(difficulty),
      ageHours: Number(age),
      powServerUrl: powServer,
    });
  };

  const handleTest = () => {
    setTestResult({ timeTaken: "...", hashrate: "..." });
    if (!powServer) return;

    fetch(`${powServer}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Difficulty: testDiff }),
    })
      .then((response) => response.json())
      .then((data) => setTestResult(data))
      .catch((error) => console.error("Error:", error));
  };

  return (
    <div className="settings-page bg-black text-white p-8 flex flex-col h-full">
      <h1 className="text-lg font-semibold mb-4">Settings</h1>
      <form onSubmit={handleSubmit}>
        <div className="flex flex-wrap -mx-2 mb-4">
          <div className="w-full md:w-1/3 px-2 mb-4 md:mb-0">
            <label className="block text-xs mb-2" htmlFor="filterDifficulty">
              Proof-of-Work Filter:
            </label>
            <input
              id="filterDifficulty"
              type="number"
              value={filterDifficulty}
              onChange={(e) => setFilterDifficulty(e.target.value)}
              min={16}
              className="w-full px-3 py-2 border rounded-md bg-black"
            />
          </div>
          <div className="w-full md:w-1/3 px-2 mb-4 md:mb-0">
            <label className="block text-xs mb-2" htmlFor="difficulty">
              Post Difficulty (PoW required to make a post):
            </label>
            <input
              id="difficulty"
              type="number"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              min={16}
              className="w-full px-3 py-2 border rounded-md bg-black"
            />
          </div>
          <div className="w-full md:w-1/3 px-2 mb-4 md:mb-0">
            <label className="block text-xs mb-2" htmlFor="age">
              Thread Age Limit (hrs):
            </label>
            <input
              id="age"
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-black"
            />
          </div>
        </div>
        <div className="pb-4">
          <button type="button" onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}>
            {">"} Advanced Settings
          </button>
          {showAdvancedSettings && (
            <>
              <div className="w-full md:w-1/3 px-2 mb-4 md:mb-0">
                <label className="block text-xs mb-2" htmlFor="powServer">
                  Remote PoW Server:
                </label>
                <input
                  id="powServer"
                  type="text"
                  value={powServer}
                  onChange={(e) => setPowServer(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-black"
                />
              </div>
              <div className="px-2">
                <label className="block text-xs mb-2" htmlFor="testAPI">
                  Test Your PoW Server (difficulty):
                </label>
                <input
                  id="testAPI"
                  type="text"
                  value={testDiff}
                  onChange={(e) => setTestDiff(e.target.value)}
                  className="w-12 px-3 py-2 border rounded-md bg-black"
                />
                <button type="button" onClick={handleTest} className="bg-black border text-white font-bold py-2 px-4 rounded">
                  Test
                </button>
                {testResult && (
                  <span>
                    Time: {testResult.timeTaken}s with a hashrate of {testResult.hashrate}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
        <button type="submit" className="bg-black border text-white font-bold py-2 px-4 rounded">
          Save Settings
        </button>
      </form>
      <div className="settings-page pt-10">
        <h1 className="text-lg font-semibold mb-4">Open Note</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigate(`/thread/${noteLink}`);
          }}
        >
          <div className="flex flex-wrap -mx-2 mb-4">
            <div className="w-full md:w-1/3 px-2 mb-4 md:mb-0">
              <label className="block text-xs mb-2" htmlFor="noteIDinput">
                Note ID:
              </label>
              <input
                id="noteIDinput"
                type="text"
                value={noteLink}
                onChange={(e) => setNoteLink(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-black"
              />
            </div>
          </div>
          <button type="submit" className="bg-black border text-white font-bold py-2 px-4 rounded">
            Open
          </button>
        </form>
      </div>
      <div className="settings-page py-10">
        <h1 className="text-lg font-semibold mb-4">About</h1>
        <div className="flex flex-col">
          <p>The Wired is an anon agora built upon the NOSTR protocol.</p>
          <br />
          <p>The Wired is built to facilitate unstoppable free speech on the internet.</p>
          <p>-Uses NOSTR as a censorship-resistant social network</p>
          <p>-Employs Proof-of-Work (PoW) as a spam prevention mechanism</p>
          <br />
          <p>Source: https://github.com/smolgrrr/TAO</p>
        </div>
      </div>
    </div>
  );
}