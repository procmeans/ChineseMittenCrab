const { describe, it } = require('node:test');
const assert = require('node:assert');
const { renderWechatReply } = require('../tools/lib/platform/wechat/reply_rendering');

describe('wechat/reply_rendering', () => {
  it('strips markdown headings', () => {
    const { text } = renderWechatReply('## 标题\n内容');
    assert.strictEqual(text, '标题\n内容');
  });

  it('strips bold markers', () => {
    const { text } = renderWechatReply('这是**粗体**文字');
    assert.strictEqual(text, '这是粗体文字');
  });

  it('strips code fences, keeps content', () => {
    const input = '代码:\n```js\nconsole.log("hi");\n```\n完毕';
    const { text } = renderWechatReply(input);
    assert.ok(text.includes('console.log("hi");'));
    assert.ok(!text.includes('```'));
  });

  it('strips inline code backticks', () => {
    const { text } = renderWechatReply('使用 `npm install` 安装');
    assert.strictEqual(text, '使用 npm install 安装');
  });

  it('converts markdown tables to readable format', () => {
    const input = '|名称|值|\n|---|---|\n|A|1|\n|B|2|';
    const { text } = renderWechatReply(input);
    assert.ok(text.includes('A | 1'));
    assert.ok(text.includes('B | 2'));
    assert.ok(!text.includes('---'));
  });

  it('collapses multiple blank lines', () => {
    const { text } = renderWechatReply('a\n\n\n\n\nb');
    assert.strictEqual(text, 'a\n\nb');
  });

  it('truncates long messages', () => {
    const long = 'A'.repeat(3000);
    const { text } = renderWechatReply(long);
    assert.ok(text.length <= 2048);
    assert.ok(text.endsWith('...(内容过长，已截断)'));
  });

  it('returns mode text', () => {
    const result = renderWechatReply('hello');
    assert.strictEqual(result.mode, 'text');
  });

  it('handles empty input', () => {
    const { text } = renderWechatReply('');
    assert.strictEqual(text, '');
  });
});
