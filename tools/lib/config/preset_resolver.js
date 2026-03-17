function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeConfig(base, override) {
  const result = { ...base };

  for (const [key, value] of Object.entries(override || {})) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeConfig(result[key], value);
      continue;
    }

    result[key] = value;
  }

  return result;
}

function resolvePresetConfig(input) {
  const defaults = input.defaults || {};
  const account = input.account || {};
  const presetName = account.preset;
  const preset = presetName ? (input.presets || {})[presetName] || {} : {};
  const accountOverride = { ...account };

  delete accountOverride.preset;

  return mergeConfig(mergeConfig(defaults, preset), accountOverride);
}

module.exports = {
  resolvePresetConfig,
};
