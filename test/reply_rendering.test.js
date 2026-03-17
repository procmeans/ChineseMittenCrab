const test = require('node:test');
const assert = require('node:assert/strict');

const { renderBotReply } = require('../tools/feishu_ws_bot');

test('markdown replies render as Feishu cards', async () => {
  const result = renderBotReply('## Build Status\n- ready');

  assert.equal(result.mode, 'interactive');
  assert.equal(result.card.header.title.content, 'ChineseMittenCrab');
  assert.match(JSON.stringify(result.card), /Build Status/);
});
