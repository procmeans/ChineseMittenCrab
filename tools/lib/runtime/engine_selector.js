const os = require('node:os');

const { runClaudeExec } = require('../claude/exec_service');
const { runCodexExec } = require('../codex/exec_service');

const ENGINES = {
  claude: {
    name: 'claude',
    bin: 'claude',
    runExec: runClaudeExec,
    buildInput: ({ config, accountName }) => ({
      model: config.model,
      account: accountName,
      accountName,
      cwd: os.homedir(),
    }),
  },
  codex: {
    name: 'codex',
    bin: 'codex',
    runExec: runCodexExec,
    buildInput: ({ config, accountName }) => {
      const codex = (config && config.codex) || {};
      return {
        bin: codex.bin || 'codex',
        model: codex.model || config.model,
        account: accountName,
        accountName,
        cwd: codex.cwd || os.homedir(),
        addDirs: codex.add_dirs || codex.addDirs || [],
        sandbox: codex.sandbox,
        approvalPolicy: codex.approval_policy || codex.approvalPolicy,
        profile: codex.profile,
        reasoningEffort: codex.reasoning_effort || codex.reasoningEffort,
        apiKey: codex.api_key || codex.apiKey,
        timeoutMs: codex.timeout_sec ? Number(codex.timeout_sec) * 1000 : undefined,
      };
    },
  },
};

function resolveEngine(config = {}) {
  const requested = String((config && config.engine) || 'claude').trim().toLowerCase();
  const engine = ENGINES[requested];
  if (!engine) {
    throw new Error(`unknown engine "${requested}" (expected one of: ${Object.keys(ENGINES).join(', ')})`);
  }
  return engine;
}

module.exports = {
  ENGINES,
  resolveEngine,
};
