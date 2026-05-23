const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

/**
 * Upload a local file to 企业微信 media storage and get a media_id back.
 *
 * Endpoint: POST /cgi-bin/media/upload?access_token=AT&type=TYPE
 * Body: multipart/form-data with one field named "media" containing the file.
 *
 * type:
 *   image — png/jpg/jpeg/gif/bmp, ≤ 2MB
 *   voice — amr/mp3, ≤ 2MB, ≤ 60s
 *   video — mp4, ≤ 10MB
 *   file  — any, ≤ 20MB (default — what bots use most)
 *
 * Returned media_id is valid for 3 days and can be passed to kf/send_msg.
 * Reuse the same media_id for multiple sends; re-upload after 3 days.
 *
 * Done with hand-written multipart instead of pulling in form-data dependency —
 * the body shape is fixed and trivial, no need for a parser library.
 */
function uploadMedia({ accessToken, filePath, type = 'file', httpRequest }) {
  return new Promise((resolve, reject) => {
    if (!accessToken) return reject(new Error('uploadMedia: accessToken required'));
    if (!filePath) return reject(new Error('uploadMedia: filePath required'));

    let fileBuffer;
    try {
      fileBuffer = fs.readFileSync(filePath);
    } catch (err) {
      return reject(new Error('uploadMedia: cannot read file ' + filePath + ': ' + err.message));
    }
    const fileName = path.basename(filePath);
    const boundary = '----CMR' + Date.now() + Math.random().toString(36).slice(2);

    const head = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="media"; filename="${fileName}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([head, fileBuffer, tail]);

    const reqOptions = {
      host: 'qyapi.weixin.qq.com',
      path: `/cgi-bin/media/upload?access_token=${encodeURIComponent(accessToken)}&type=${encodeURIComponent(type)}`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };

    const req = (httpRequest || https.request)(reqOptions, (res) => {
      let buf = '';
      res.on('data', (chunk) => { buf += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(buf));
        } catch (e) {
          resolve({ raw: buf, _parseError: e.message });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Pick the right media `type` parameter from a file path's extension.
 * Defaults to `file` for unknown extensions, which is the safest catch-all.
 */
function guessMediaType(filePath) {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, '');
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) return 'image';
  if (['amr', 'mp3', 'wav', 'm4a'].includes(ext)) return 'voice';
  if (ext === 'mp4') return 'video';
  return 'file';
}

module.exports = {
  uploadMedia,
  guessMediaType,
};
