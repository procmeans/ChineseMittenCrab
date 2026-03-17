const fs = require('node:fs');

function parseScalar(value) {
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  if (/^-?\d+$/.test(value)) {
    return Number(value);
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parseSimpleYaml(text) {
  const root = {};
  const stack = [{ indent: -1, value: root }];

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) {
      continue;
    }

    const match = rawLine.match(/^(\s*)([^:]+):(?:\s*(.*))?$/);

    if (!match) {
      continue;
    }

    const indent = match[1].length;
    const key = match[2].trim();
    const rawValue = match[3];

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].value;

    if (!rawValue) {
      parent[key] = {};
      stack.push({ indent, value: parent[key] });
      continue;
    }

    parent[key] = parseScalar(rawValue.trim());
  }

  return root;
}

function loadLocalSecrets(options = {}) {
  const fileSystem = options.fs || fs;
  const filePath = options.filePath || 'config/secrets/local.yaml';

  if (!fileSystem.existsSync(filePath)) {
    return {};
  }

  return parseSimpleYaml(fileSystem.readFileSync(filePath, 'utf8'));
}

module.exports = {
  loadLocalSecrets,
  parseSimpleYaml,
};
