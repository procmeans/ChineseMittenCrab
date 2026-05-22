// Decide whether to ignore an incoming Feishu event because the bot wasn't actually addressed.
//
// Rules:
//   - P2P messages always pass (every direct message is for us).
//   - Group messages pass if any mention.id.open_id matches the bot's own open_id.
//   - Group messages pass if there is an unexpired follow-up window for this taskKey (the user @-ed
//     this bot recently, so subsequent un-@-ed turns continue the conversation).
//   - Otherwise (group message, not addressed, no active follow-up) → ignore.
//
// Bypass:
//   - When selfOpenId is empty (API lookup failed), the filter is disabled (returns false for every
//     event) so the bot doesn't go silent. The caller's earlier warning makes the failure visible.
//   - When ctx.ignoreUnmentioned === false, the filter is disabled for that account.
function shouldIgnoreMessage(event, ctx = {}) {
  const { selfOpenId, followUpStates, ignoreUnmentioned = true } = ctx;

  if (!ignoreUnmentioned) return false;
  if (!selfOpenId) return false;
  if (!event || event.chatType !== 'group') return false;

  const mentionsSelf = (event.mentions || []).some((m) => {
    const openId = m && m.id && m.id.open_id;
    return openId && openId === selfOpenId;
  });
  if (mentionsSelf) return false;

  if (followUpStates && event.taskKey) {
    const state = followUpStates.get(event.taskKey);
    if (state && state.expiresAt && state.expiresAt > Date.now()) {
      return false;
    }
  }

  return true;
}

module.exports = {
  shouldIgnoreMessage,
};
