const fs = require('node:fs');
const path = require('node:path');

async function downloadFileToTempFile(client, messageId, fileKey, options = {}) {
  const downloader =
    client.downloadMessageResource ||
    client.downloadFile ||
    (async () => Buffer.alloc(0));
  const tmpDir = options.tmpDir || '/tmp';
  const fileName = options.fileName || `${fileKey}.bin`;
  const filePath = path.join(tmpDir, fileName);
  const content = await downloader(messageId, fileKey);

  fs.writeFileSync(filePath, content);

  return {
    filePath,
    fileName,
  };
}

module.exports = {
  downloadFileToTempFile,
};
