const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveClaudeHome } = require('../tools/lib/claude/claude_home');

test('resolveClaudeHome derives a per-account path', () => {
  assert.equal(
    resolveClaudeHome({
      accountName: 'default',
      baseDir: '/tmp/cmr',
    }),
    '/tmp/cmr/claude/default'
  );
});
