import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "../../app/settings";
import { Button } from "../../shared/ui/Button";
import { Input } from "../../shared/ui/Input";

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
  const filterDifficultyValue = Number(filterDifficulty);
  const filterDifficultyError =
    filterDifficulty !== "" && (Number.isNaN(filterDifficultyValue) || filterDifficultyValue < 16)
      ? "minimum signal is 16"
      : undefined;

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
    <div className="settings-page bg-void text-primary p-8 flex flex-col h-full max-w-content">
      <h1 className="text-display font-medium mb-4">settings</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            id="filterDifficulty"
            label="proof filter"
            type="number"
            value={filterDifficulty}
            onChange={(e) => setFilterDifficulty(e.target.value)}
            min={16}
            error={filterDifficultyError}
          />
          <Input
            id="difficulty"
            label="post signal"
            type="number"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            min={16}
          />
          <Input
            id="age"
            label="thread age (hrs)"
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
          />
        </div>
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
          >
            {showAdvancedSettings ? "hide advanced" : "advanced"}
          </Button>
          {showAdvancedSettings && (
            <div className="mt-4 flex flex-col gap-4">
              <Input
                id="powServer"
                label="remote signal relay"
                type="text"
                value={powServer}
                onChange={(e) => setPowServer(e.target.value)}
              />
              <div className="flex flex-wrap items-end gap-3">
                <Input
                  id="testAPI"
                  label="test relay (difficulty)"
                  type="text"
                  value={testDiff}
                  onChange={(e) => setTestDiff(e.target.value)}
                  containerClassName="w-auto min-w-[6rem]"
                />
                <Button type="button" variant="primary" size="sm" onClick={handleTest}>
                  test
                </Button>
                {testResult && (
                  <p className="text-meta text-secondary" role="status">
                    {testResult.timeTaken}s · {testResult.hashrate}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        <Button type="submit" variant="primary">
          save
        </Button>
      </form>
      <div className="pt-10">
        <h2 className="text-body font-medium mb-4">open note</h2>
        <form
          className="flex flex-col gap-4 max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(`/thread/${noteLink}`);
          }}
        >
          <Input
            id="noteIDinput"
            label="note ref"
            type="text"
            value={noteLink}
            onChange={(e) => setNoteLink(e.target.value)}
          />
          <Button type="submit" variant="primary">
            open
          </Button>
        </form>
      </div>
      <div className="py-10">
        <h2 className="text-body font-medium mb-4">about</h2>
        <div className="flex flex-col gap-3 text-body text-secondary">
          <p>The Wired is an anon agora built upon the NOSTR protocol.</p>
          <p>The Wired is built to facilitate unstoppable free speech on the internet.</p>
          <p>-Uses NOSTR as a censorship-resistant social network</p>
          <p>-Employs Proof-of-Work (PoW) as a spam prevention mechanism</p>
          <p>Source: https://github.com/smolgrrr/TAO</p>
        </div>
      </div>
    </div>
  );
}