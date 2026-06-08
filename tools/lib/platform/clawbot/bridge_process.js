const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');

function createRequestId() {
  return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function createClawbotBridgeProcess({
  spawnFn = childProcess.spawn,
  pythonBin = 'python3',
  bridgePath,
  account = 'default',
  stateDir,
  debug = false,
}) {
  const emitter = new EventEmitter();
  const args = [bridgePath, '--account', account];
  if (stateDir) args.push('--state-dir', stateDir);
  if (debug) args.push('--debug');

  const child = spawnFn(pythonBin, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdoutBuffer = '';
  if (child.stdout) {
    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString('utf8');
      let newlineIndex = stdoutBuffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        if (line) {
          try {
            emitter.emit('message', JSON.parse(line));
          } catch (err) {
            emitter.emit('error', new Error('invalid ClawBot bridge JSON: ' + err.message));
          }
        }
        newlineIndex = stdoutBuffer.indexOf('\n');
      }
    });
  }

  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      emitter.emit('stderr', chunk.toString('utf8'));
    });
  }

  child.on('error', (err) => emitter.emit('error', err));
  child.on('exit', (code, signal) => emitter.emit('exit', { code, signal }));

  function sendCommand(command) {
    const requestId = createRequestId();
    const payload = { request_id: requestId, ...command };
    child.stdin.write(JSON.stringify(payload) + '\n');
    return Promise.resolve({ replyMessageId: requestId, requestId });
  }

  emitter.sendText = ({ accountId, userId, text }) => sendCommand({
    type: 'send_text',
    account_id: accountId,
    user_id: userId,
    text,
  });

  emitter.sendFile = ({ accountId, userId, filePath }) => sendCommand({
    type: 'send_file',
    account_id: accountId,
    user_id: userId,
    file_path: filePath,
  });

  emitter.sendTyping = ({ accountId, userId, status }) => sendCommand({
    type: 'send_typing',
    account_id: accountId,
    user_id: userId,
    status,
  });

  emitter.stop = () => {
    if (child.kill) child.kill('SIGTERM');
  };

  emitter.child = child;
  return emitter;
}

module.exports = {
  createClawbotBridgeProcess,
};
