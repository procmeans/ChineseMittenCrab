#!/usr/bin/env node

function readArg(name, fallbackValue) {
  const index = process.argv.indexOf(name);

  if (index === -1 || index === process.argv.length - 1) {
    return fallbackValue;
  }

  return process.argv[index + 1];
}

function main() {
  const accountName = readArg('--account', 'default');

  if (process.argv.includes('--dry-run')) {
    console.log(`FEISHU_WS_DRY_RUN account=${accountName} claude=ready feishu=ready`);
    return;
  }

  console.log(`FEISHU_WS_BOT_START account=${accountName}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  readArg,
};
