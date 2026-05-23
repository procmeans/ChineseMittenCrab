const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { uploadMedia, guessMediaType } = require('../tools/lib/platform/wechat/media');

describe('wechat/media', () => {
  describe('guessMediaType', () => {
    it('returns image for common image extensions', () => {
      assert.strictEqual(guessMediaType('/tmp/a.png'), 'image');
      assert.strictEqual(guessMediaType('/tmp/a.JPG'), 'image');
      assert.strictEqual(guessMediaType('/tmp/a.gif'), 'image');
      assert.strictEqual(guessMediaType('/tmp/a.webp'), 'image');
    });

    it('returns voice/video for audio + mp4', () => {
      assert.strictEqual(guessMediaType('/tmp/a.amr'), 'voice');
      assert.strictEqual(guessMediaType('/tmp/a.mp3'), 'voice');
      assert.strictEqual(guessMediaType('/tmp/a.mp4'), 'video');
    });

    it('falls back to file for unknown / generic extensions', () => {
      assert.strictEqual(guessMediaType('/tmp/report.pdf'), 'file');
      assert.strictEqual(guessMediaType('/tmp/data.csv'), 'file');
      assert.strictEqual(guessMediaType('/tmp/binary'), 'file');
    });
  });

  describe('uploadMedia', () => {
    it('rejects when accessToken or filePath missing', async () => {
      await assert.rejects(() => uploadMedia({ filePath: '/tmp/x' }), /accessToken required/);
      await assert.rejects(() => uploadMedia({ accessToken: 'AT' }), /filePath required/);
    });

    it('rejects when file is unreadable', async () => {
      await assert.rejects(
        () => uploadMedia({ accessToken: 'AT', filePath: '/nonexistent/path/abc.txt' }),
        /cannot read file/
      );
    });

    it('builds a multipart body with the file content and POSTs to /cgi-bin/media/upload', async () => {
      const tmpFile = path.join(os.tmpdir(), 'cmr-media-test-' + Date.now() + '.txt');
      fs.writeFileSync(tmpFile, 'hello kf media');

      let captured = null;
      const fakeRequest = (options, cb) => {
        captured = { options, chunks: [] };
        const stream = {
          on(event, fn) { if (event === 'error') { /* noop */ } return stream; },
          write(buf) { captured.chunks.push(Buffer.from(buf)); return stream; },
          end() {
            const fakeRes = {
              on(event, fn) {
                if (event === 'data') fn(Buffer.from('{"media_id":"MID_001","type":"file","created_at":"1779540000"}'));
                if (event === 'end') fn();
                return fakeRes;
              },
            };
            cb(fakeRes);
            return stream;
          },
        };
        return stream;
      };

      const resp = await uploadMedia({
        accessToken: 'AT_xxx',
        filePath: tmpFile,
        type: 'file',
        httpRequest: fakeRequest,
      });

      assert.strictEqual(resp.media_id, 'MID_001');
      assert.strictEqual(captured.options.host, 'qyapi.weixin.qq.com');
      assert.match(captured.options.path, /\/cgi-bin\/media\/upload\?access_token=AT_xxx&type=file/);
      assert.match(captured.options.headers['Content-Type'], /^multipart\/form-data; boundary=----CMR/);

      // Body must include the file content and a closing boundary
      const body = Buffer.concat(captured.chunks).toString('utf8');
      assert.ok(body.includes('hello kf media'), 'body should contain file content');
      assert.ok(body.includes('name="media"'), 'body should declare media field');
      assert.match(body, /--+CMR[^\r\n]+--\r\n$/, 'body should end with closing boundary');

      fs.unlinkSync(tmpFile);
    });
  });
});
