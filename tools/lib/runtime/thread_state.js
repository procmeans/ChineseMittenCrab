function ensureChatState(states, key) {
  if (!states.has(key)) {
    states.set(key, {
      key,
      currentThread: null,
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

module.exports = {
  ensureChatState,
  getCurrentThread,
  setCurrentThread,
};
