function ensureChatState(states, key) {
  if (!states.has(key)) {
    states.set(key, {
      key,
      currentThread: null,
      history: [],
    });
  }

  return states.get(key);
}

function setCurrentThread(state, thread) {
  state.currentThread = thread;
  return state;
}

function getCurrentThread(state) {
  return state.currentThread;
}

function appendHistory(state, userText, assistantText) {
  if (!state.history) state.history = [];
  state.history.push({ user: userText, assistant: assistantText });
  if (state.history.length > 10) {
    state.history = state.history.slice(-10);
  }
}

function clearHistory(state) {
  state.history = [];
}

function getHistory(state) {
  return state.history || [];
}

function saveStates(followUpStates, account = 'default') {
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const statePath = path.join(os.homedir(), '.chinese-mitten-crab', 'state', account, 'threads.json');
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const data = {};
  for (const [key, state] of followUpStates.entries()) {
    data[key] = { history: state.history || [], expiresAt: state.expiresAt || null };
  }
  fs.writeFileSync(statePath, JSON.stringify(data), 'utf8');
}

function loadStates(account = 'default') {
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const statePath = path.join(os.homedir(), '.chinese-mitten-crab', 'state', account, 'threads.json');
  const map = new Map();
  try {
    const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const now = Date.now();
    for (const [key, saved] of Object.entries(data)) {
      if (saved.expiresAt && saved.expiresAt > now && saved.history && saved.history.length > 0) {
        map.set(key, { key, currentThread: null, history: saved.history, expiresAt: saved.expiresAt });
      }
    }
  } catch (_) {}
  return map;
}

module.exports = {
  ensureChatState,
  getCurrentThread,
  setCurrentThread,
  appendHistory,
  clearHistory,
  getHistory,
  saveStates,
  loadStates,
};
