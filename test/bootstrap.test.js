const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('project bootstrap files exist', () => {
  assert.equal(fs.existsSync('package.json'), true);
  assert.equal(fs.existsSync('README.md'), true);
  assert.equal(fs.existsSync('config/secrets/local.example.yaml'), true);
  assert.equal(fs.existsSync('config/feishu/default.example.json'), true);
});
