const test = require('node:test');
const assert = require('node:assert/strict');

const { renderBotReply } = require('../tools/feishu_ws_bot');

test('markdown replies render as Feishu cards', async () => {
  const result = renderBotReply('## Build Status\n- ready');

  // renderBotReply returns { card, filePaths } where card is the rendered object
  assert.equal(result.card.mode, 'interactive');
  assert.equal(result.card.card.header.title.content, 'cmr');
  assert.match(JSON.stringify(result.card.card), /Build Status/);
  assert.deepEqual(result.filePaths, []);
});
