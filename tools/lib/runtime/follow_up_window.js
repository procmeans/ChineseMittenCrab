function refreshFollowUpWindow(state, input = {}) {
  const now = input.now || Date.now();
  const ttlMs = input.ttlMs || 5 * 60 * 1000;

  state.expiresAt = now + ttlMs;
  return state;
}

function isFollowUpWindowOpen(state, now = Date.now()) {
  return Boolean(state.expiresAt && state.expiresAt > now);
}

module.exports = {
  isFollowUpWindowOpen,
  refreshFollowUpWindow,
};
