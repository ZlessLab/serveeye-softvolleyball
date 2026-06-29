const http = require('http');
const fs = require('fs');
const path = require('path');

const dir = path.dirname(process.argv[1]);
const types = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.css':  'text/css',
  '.svg':  'image/svg+xml'
};

// No-cache targets: always revalidate entry points and non-hashed app icons.
const NO_CACHE_EXTS = new Set(['.html', '.json', '.js']);
const NO_CACHE_FILES = new Set([
  '/apple-touch-icon.png',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png'
]);

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/soft-volleyball-score.html';
  const file = path.join(dir, url);
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found: ' + url);
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const ct = types[ext] || 'application/octet-stream';
    const cacheControl = NO_CACHE_EXTS.has(ext) || NO_CACHE_FILES.has(url)
      ? 'no-cache, no-store, must-revalidate'
      : 'public, max-age=31536000, immutable';
    res.writeHead(200, {
      'Content-Type': ct + (ext === '.png' || ext === '.jpg' ? '' : '; charset=utf-8'),
      'Cache-Control': cacheControl
    });
    res.end(data);
  });
});

server.listen(8080, '0.0.0.0', () => {
  console.log('Server running!');
  console.log('Local:  http://localhost:8080');
  console.log('LAN:    http://192.168.0.6:8080');
  console.log('Press Ctrl+C to stop');
});
