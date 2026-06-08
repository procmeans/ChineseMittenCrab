function normalizeTimestamp(value) {
  const n = Number(value || 0);
  if (!n) return 0;
  return n > 1e12 ? n : n * 1000;
}

function normalizeFiles(media) {
  if (!Array.isArray(media)) return [];
  return media
    .map((item) => ({
      type: String(item.type || item.msgtype || 'file'),
      filePath: String(item.file_path || item.filePath || ''),
    }))
    .filter((item) => item.filePath);
}

function normalizeIncomingClawbotEvent(payload) {
  const data = typeof payload === 'string' ? JSON.parse(payload) : (payload || {});
  const accountId = String(data.account_id || data.accountId || data.client_id || data.clientId || '');
  const userId = String(data.user_id || data.userId || data.from || data.From || '');
  const messageId = String(data.message_id || data.messageId || data.id || '');
  const rawText = data.text || data.content || '';
  const text = typeof rawText === 'string' ? rawText : JSON.stringify(rawText);

  return {
    taskKey: accountId ? `${accountId}::${userId}` : userId,
    chatId: userId,
    senderId: userId,
    messageId,
    text,
    chatType: 'p2p',
    attachments: [],
    parentId: '',
    rootId: '',
    createTime: normalizeTimestamp(data.timestamp || data.create_time || data.createTime),
    mentions: [],
    accountId,
    userId,
    files: normalizeFiles(data.media || data.files),
    quotedText: '',
    rawMsg: data,
  };
}

module.exports = {
  normalizeIncomingClawbotEvent,
};
