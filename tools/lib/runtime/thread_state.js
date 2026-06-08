function ensureChatState(states, key) {
  if (!states.has(key)) {
    states.set(key, {
      key,
      currentThread: null,
      history: [],
      engineName: null,
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
    data[key] = {
      history: state.history || [],
      expiresAt: state.expiresAt || null,
      engineName: state.engineName || null,
    };
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
      const hasHistory = Array.isArray(saved.history) && saved.history.length > 0;
      const engineName = typeof saved.engineName === 'string' && saved.engineName ? saved.engineName : null;
      if (!hasHistory && !engineName) continue;

      const expiresAt = saved.expiresAt && saved.expiresAt > now ? saved.expiresAt : null;
      map.set(key, {
        key,
        currentThread: null,
        history: expiresAt ? saved.history : [],
        expiresAt,
        engineName,
      });
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
