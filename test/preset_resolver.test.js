const test = require('node:test');
const assert = require('node:assert/strict');

const { resolvePresetConfig } = require('../tools/lib/config/preset_resolver');

test('resolvePresetConfig merges defaults, preset, and account override', () => {
  const input = {
    defaults: {
      feishu: {
        bot_name: 'ChineseMittenCrab',
        require_mention: true,
      },
      claude: {
        model: 'claude-3-5-haiku',
        cwd: '/srv/default',
      },
    },
    presets: {
      design: {
        feishu: {
          progress_mode: 'interactive',
        },
        claude: {
          cwd: '/srv/design',
          add_dirs: ['/srv/design/docs'],
        },
      },
    },
    account: {
      preset: 'design',
      feishu: {
        bot_name: 'CMR Design',
      },
      claude: {
        model: 'claude-3-7-sonnet',
      },
    },
  };

  assert.deepEqual(resolvePresetConfig(input), {
    feishu: {
      bot_name: 'CMR Design',
      require_mention: true,
      progress_mode: 'interactive',
    },
    claude: {
      model: 'claude-3-7-sonnet',
      cwd: '/srv/design',
      add_dirs: ['/srv/design/docs'],
    },
  });
});
