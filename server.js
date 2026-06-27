const http = require('http');
const fs = require('fs');
const path = require('path');

const dir = path.dirname(process.argv[1]);
const types = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.css':  'text/css',
  '.svg':  'image/svg+xml'
};

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
    const ct = (types[ext] || 'application/octet-stream');
    res.writeHead(200, {
      'Content-Type': ct + (ext === '.png' ? '' : '; charset=utf-8'),
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

server.listen(8080, '0.0.0.0', () => {
  console.log('Server running!');
  console.log('Local:  http://localhost:8080');
  console.log('LAN:    http://192.168.0.5:8080');
  console.log('Press Ctrl+C to stop');
});
