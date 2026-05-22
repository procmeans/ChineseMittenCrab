const fs = require('node:fs');
const path = require('node:path');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);

async function downloadFileToTempFile(client, messageId, fileKey, options = {}) {
  const downloader =
    client.downloadMessageResource ||
    client.downloadFile ||
    (async () => Buffer.alloc(0));
  const tmpDir = options.tmpDir || '/tmp';
  const fileName = options.fileName || `${fileKey}.bin`;
  const filePath = path.join(tmpDir, fileName);

  const ext = path.extname(fileName).toLowerCase();
  const type = IMAGE_EXTS.has(ext) ? 'image' : 'file';

  const result = await downloader(messageId, fileKey, type, filePath);

  // If downloader didn't write to destPath directly, write the returned buffer
  if (result && Buffer.isBuffer(result)) {
    fs.writeFileSync(filePath, result);
  }

  return {
    filePath,
    fileName,
  };
}

module.exports = {
  downloadFileToTempFile,
};
