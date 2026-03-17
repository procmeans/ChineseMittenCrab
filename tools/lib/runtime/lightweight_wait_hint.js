function createDelayedWaitNotice(deps, input = {}) {
  const notice = {
    sent: false,
    dismiss,
  };

  const setTimeoutFn = deps.setTimeout || setTimeout;
  const clearTimeoutFn = deps.clearTimeout || clearTimeout;
  const sendNotice = deps.sendNotice || (async () => {});

  const timer = setTimeoutFn(async () => {
    await sendNotice({
      message: input.message,
    });
    notice.sent = true;
  }, input.delayMs || 0);

  function dismiss() {
    clearTimeoutFn(timer);
  }

  return notice;
}

module.exports = {
  createDelayedWaitNotice,
};
