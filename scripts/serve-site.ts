/** Serve build/site locally (npm run site:serve), with the MIME types browsers need. */

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', 'build', 'site');
const PORT = Number(process.env['PORT'] ?? 4173);

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.gb': 'application/octet-stream',
};

http
  .createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const file = path.join(
      ROOT,
      decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname),
    );
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    });
    fs.createReadStream(file).pipe(response);
  })
  .listen(PORT, () => {
    console.log(`Serving build/site at http://localhost:${String(PORT)}`);
  });
