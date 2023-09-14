import {generatePrivateKey, getPublicKey, signEvent} from 'nostr-tools';
import {updateElemHeight} from './utils/dom';
import {powEvent} from './system';
import {publish} from './relays';

const settingsView = document.querySelector('#settings') as HTMLElement;

export const closeSettingsView = () => settingsView.hidden = true;

export const toggleSettingsView = () => settingsView.hidden = !settingsView.hidden;

let pubkey: string = '';

const loadOrGenerateKeys = () => {
  const storedPubKey = localStorage.getItem('pub_key');
  if (storedPubKey) {
    return storedPubKey;
  }
  const privatekey = generatePrivateKey();
  const pubkey = getPublicKey(privatekey);
  localStorage.setItem('private_key', privatekey);
  localStorage.setItem('pub_key', pubkey);
  return pubkey;
};

let filterDifficulty: number = 0;
let difficulty: number = 16;
let timeout: number = 5;
let rerenderFeed: (() => void) | undefined;

/**
 * global config object
 * config.pubkey, if not set loaded from localStorage or generate a new key
 */
export const config = {
  get pubkey() {
    if (!pubkey) {
      pubkey = loadOrGenerateKeys();
    }
    return pubkey;
  },
  set pubkey(value) {
    console.info(`pubkey was set to ${value}`);
    pubkey = value;
  },
  get filterDifficulty() {
    return filterDifficulty;
  },
  get difficulty() {
    return difficulty;
  },
  get timeout() {
    return timeout;
  },
  set rerenderFeed(value: () => void) {
    rerenderFeed = value;
  }
};

const getNumberFromStorage = (
  item: string,
  fallback: number,
) => {
  const stored = localStorage.getItem(item);
  if (!stored) {
    return fallback;
  }
  return Number(stored);
};

// filter difficulty
const filterDifficultyInput = document.querySelector('#filterDifficulty') as HTMLInputElement;
const filterDifficultyDisplay = document.querySelector('[data-display="filter_difficulty"]') as HTMLElement;
filterDifficultyInput.addEventListener('input', (e) => {
  localStorage.setItem('filter_difficulty', filterDifficultyInput.value);
  filterDifficulty = filterDifficultyInput.valueAsNumber;
  filterDifficultyDisplay.textContent = filterDifficultyInput.value;
  rerenderFeed && rerenderFeed();
});
filterDifficulty = getNumberFromStorage('filter_difficulty', 0);
filterDifficultyInput.valueAsNumber = filterDifficulty;
filterDifficultyDisplay.textContent = filterDifficultyInput.value;

// mining difficulty target
const miningTargetInput = document.querySelector('#miningTarget') as HTMLInputElement;
miningTargetInput.addEventListener('input', (e) => {
  localStorage.setItem('mining_target', miningTargetInput.value);
  difficulty = miningTargetInput.valueAsNumber;
});
// arbitrary difficulty default, still experimenting.
difficulty = getNumberFromStorage('mining_target', 16);
miningTargetInput.valueAsNumber = difficulty;

// mining timeout
const miningTimeoutInput = document.querySelector('#miningTimeout') as HTMLInputElement;
miningTimeoutInput.addEventListener('input', (e) => {
  localStorage.setItem('mining_timeout', miningTimeoutInput.value);
  timeout = miningTimeoutInput.valueAsNumber;
});
timeout = getNumberFromStorage('mining_timeout', 5);
miningTimeoutInput.valueAsNumber = timeout;


// settings
const settingsForm = document.querySelector('form[name="settings"]') as HTMLFormElement;
const privateKeyInput = settingsForm.querySelector('#privatekey') as HTMLInputElement;
const pubKeyInput = settingsForm.querySelector('#pubkey') as HTMLInputElement;
const statusMessage = settingsForm.querySelector('#keystatus') as HTMLElement;
const generateBtn = settingsForm.querySelector('button[name="generate"]') as HTMLButtonElement;
const importBtn = settingsForm.querySelector('button[name="import"]') as HTMLButtonElement;
const privateTgl = settingsForm.querySelector('button[name="privatekey-toggle"]') as HTMLButtonElement;

const validKeys = (
  privatekey: string,
  pubkey: string,
) => {
  try {
    if (getPublicKey(privatekey) === pubkey) {
      statusMessage.hidden = true;
      statusMessage.textContent = 'public-key corresponds to private-key';
      importBtn.removeAttribute('disabled');
      return true;
    } else {
      statusMessage.textContent = 'private-key does not correspond to public-key!'
    }
  } catch (e) {
    statusMessage.textContent = `not a valid private-key: ${e.message || e}`;
  }
  statusMessage.hidden = false;
  importBtn.disabled = true;
  return false;
};

generateBtn.addEventListener('click', () => {
  const privatekey = generatePrivateKey();
  const pubkey = getPublicKey(privatekey);
  if (validKeys(privatekey, pubkey)) {
    privateKeyInput.value = privatekey;
    pubKeyInput.value = pubkey;
    statusMessage.textContent = 'private-key created!';
    statusMessage.hidden = false;
  }
});

importBtn.addEventListener('click', () => {
  const privatekey = privateKeyInput.value;
  const pubkeyInput = pubKeyInput.value;
  if (validKeys(privatekey, pubkeyInput)) {
    localStorage.setItem('private_key', privatekey);
    localStorage.setItem('pub_key', pubkeyInput);
    statusMessage.textContent = 'stored private and public key locally!';
    statusMessage.hidden = false;
    config.pubkey = pubkeyInput;
  }
});

settingsForm.addEventListener('input', () => validKeys(privateKeyInput.value, pubKeyInput.value));

privateKeyInput.addEventListener('paste', (event) => {
  if (pubKeyInput.value || !event.clipboardData) {
    return;
  }
  if (privateKeyInput.value === '' || ( // either privatekey field is empty
    privateKeyInput.selectionStart === 0 // or the whole text is selected and replaced with the clipboard
    && privateKeyInput.selectionEnd === privateKeyInput.value.length
  )) { // only generate the pubkey if no data other than the text from clipboard will be used
    try {
      pubKeyInput.value = getPublicKey(event.clipboardData.getData('text'));
    } catch(err) {} // settings form will call validKeys on input and display the error
  }
});

privateTgl.addEventListener('click', () => {
  privateKeyInput.type = privateKeyInput.type === 'text' ? 'password' : 'text';
});

privateKeyInput.value = localStorage.getItem('private_key') || '';
pubKeyInput.value = localStorage.getItem('pub_key') || '';

// profile
const profileForm = document.querySelector('form[name="profile"]') as HTMLFormElement;
const profileSubmit = profileForm.querySelector('button[type="submit"]') as HTMLButtonElement;
const profileStatus = document.querySelector('#profilestatus') as HTMLElement;

profileForm.addEventListener('input', (e) => {
  if (e.target instanceof HTMLElement) {
    if (e.target?.nodeName === 'TEXTAREA') {
      updateElemHeight(e.target as HTMLTextAreaElement);
    }
  }
  const form = new FormData(profileForm);
  const name = form.get('name');
  const about = form.get('about');
  const picture = form.get('picture');
  profileSubmit.disabled = !(name || about || picture);
});

profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(profileForm);
  const newProfile = await powEvent({
    kind: 0,
    pubkey: config.pubkey,
    content: JSON.stringify(Object.fromEntries(form)),
    tags: [],
    created_at: Math.floor(Date.now() * 0.001)
  }, {
    difficulty: config.difficulty,
    statusElem: profileStatus,
    timeout: config.timeout,
  }).catch(console.warn);
  if (!newProfile) {
    profileStatus.textContent = 'publishing profile data canceled';
    profileStatus.hidden = false;
    return;
  }
  const privatekey = localStorage.getItem('private_key');
  if (!privatekey) {
    profileStatus.textContent = 'no private key to sign';
    profileStatus.hidden = false;
    return;
  }
  const sig = signEvent(newProfile, privatekey);
  // TODO: validateEvent
  if (sig) {
    publish({...newProfile, sig}, (relay, error) => {
      if (error) {
        return console.error(error, relay);
      }
      console.info(`publish request sent to ${relay}`);
      profileStatus.textContent = 'profile successfully published';
      profileStatus.hidden = false;
      profileSubmit.disabled = true;
    });
  }
});
