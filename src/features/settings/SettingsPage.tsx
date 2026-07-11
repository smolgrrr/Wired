import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "../../app/settings";
import { Button } from "../../shared/ui/Button";
import { Input } from "../../shared/ui/Input";
import { PageShell } from "../../shared/ui/PageShell";

const MIN_SIGNAL = 16;
const MIN_THREAD_AGE_HOURS = 1;
const MAX_THREAD_AGE_HOURS = 168;

function integerError(value: string, min: number, max?: number, unit?: string) {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  const range = `${min}-${max}${unit ? ` ${unit}` : ""}`;

  if (trimmed === "") {
    return "required";
  }

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return "enter a whole number";
  }

  if (parsed < min) {
    return max ? `use ${range}` : `use ${min} or higher`;
  }

  if (max !== undefined && parsed > max) {
    return `use ${range}`;
  }

  return undefined;
}

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings();
  const [filterDifficulty, setFilterDifficulty] = useState(String(settings.filterDifficulty));
  const [difficulty, setDifficulty] = useState(String(settings.difficulty));
  const [age, setAge] = useState(String(settings.ageHours));
  const [threadRef, setThreadRef] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  const navigate = useNavigate();
  const filterDifficultyError = integerError(filterDifficulty, MIN_SIGNAL);
  const difficultyError = integerError(difficulty, MIN_SIGNAL);
  const ageError = integerError(age, MIN_THREAD_AGE_HOURS, MAX_THREAD_AGE_HOURS, "hours");
  const hasSettingsError = Boolean(filterDifficultyError || difficultyError || ageError);

  const handleSettingsChange = (
    setter: React.Dispatch<React.SetStateAction<string>>,
    value: string,
  ) => {
    setSaveStatus("idle");
    setter(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (hasSettingsError) {
      setSaveStatus("idle");
      return;
    }

    updateSettings({
      filterDifficulty: Number(filterDifficulty),
      difficulty: Number(difficulty),
      ageHours: Number(age),
    });
    setSaveStatus("saved");
  };

  return (
    <PageShell className="settings-page bg-void p-8 flex flex-col h-full max-w-content mx-auto">
      <h1 className="text-display font-medium mb-4">settings</h1>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            id="filterDifficulty"
            label="proof filter"
            type="number"
            value={filterDifficulty}
            onChange={(e) => handleSettingsChange(setFilterDifficulty, e.target.value)}
            min={MIN_SIGNAL}
            step={1}
            inputMode="numeric"
            hint="Feed minimum; higher hides more low-proof roots. 16+."
            error={filterDifficultyError}
          />
          <Input
            id="difficulty"
            label="post signal"
            type="number"
            value={difficulty}
            onChange={(e) => handleSettingsChange(setDifficulty, e.target.value)}
            min={MIN_SIGNAL}
            step={1}
            inputMode="numeric"
            hint="Proof mined for new posts; higher carries more weight and takes longer. 16+."
            error={difficultyError}
          />
          <Input
            id="age"
            label="thread age (hrs)"
            type="number"
            value={age}
            onChange={(e) => handleSettingsChange(setAge, e.target.value)}
            min={MIN_THREAD_AGE_HOURS}
            max={MAX_THREAD_AGE_HOURS}
            step={1}
            inputMode="numeric"
            hint="Feed lookback; shorter loads faster, longer reaches older threads. 1-168."
            error={ageError}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={hasSettingsError}>
            {saveStatus === "saved" ? "saved" : "save"}
          </Button>
          {saveStatus === "saved" && (
            <p role="status" className="text-meta text-secondary">
              settings saved
            </p>
          )}
        </div>
      </form>
      <div className="pt-10">
        <h2 className="text-body font-medium mb-4">open thread</h2>
        <form
          className="flex flex-col gap-4 max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(`/thread/${threadRef}`);
          }}
        >
          <Input
            id="threadRefInput"
            label="thread ref"
            type="text"
            value={threadRef}
            onChange={(e) => setThreadRef(e.target.value)}
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
    </PageShell>
  );
}
