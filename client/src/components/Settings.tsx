import React, { useEffect, useState } from 'react';

const Settings = () => {
  // State variables to hold the settings
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [username, setUsername] = useState('');

  // Mimic fetching existing settings from an API or local storage
  useEffect(() => {
    // Simulate fetching existing settings
    const existingSettings = {
      isDarkMode: false, // replace with actual value
      username: '' // replace with actual value
    };
    setIsDarkMode(existingSettings.isDarkMode);
    setUsername(existingSettings.username);
  }, []);

  // Function to save changes (simulate API call or local storage update)
  const saveChanges = () => {
    // Replace this with an actual API call or local storage update
    console.log('Dark Mode:', isDarkMode);
    console.log('Username:', username);
  };

  return (
    <div className="settings-page">
      <h1>Settings</h1>

      <div className="setting-item">
        <label>
          Dark Mode
          <input
            type="checkbox"
            checked={isDarkMode}
            onChange={(e) => setIsDarkMode(e.target.checked)}
          />
        </label>
      </div>

      <div className="setting-item">
        <label>
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
      </div>

      <button onClick={saveChanges}>Save Changes</button>
    </div>
  );
};

export default Settings;
