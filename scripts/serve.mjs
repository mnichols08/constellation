import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const allowed = new Map([['/', ['../index.html', 'text/html']], ['/src/preview.css', ['../src/preview.css', 'text/css']], ['/src/preview.mjs', ['../src/preview.mjs', 'text/javascript']], ['/src/constellation.mjs', ['../src/constellation.mjs', 'text/javascript']]]);
allowed.set('/profiles/preview.html', ['../profiles/preview.html', 'text/html']);
allowed.set('/src/export.mjs', ['../src/export.mjs', 'text/javascript']);
allowed.set('/src/visual-style.mjs', ['../src/visual-style.mjs', 'text/javascript']);
allowed.set('/dist/mnichols08.svg', ['../dist/mnichols08.svg', 'image/svg+xml']);
for (const variant of ['dark', 'light']) allowed.set(`/dist/mnichols08-${variant}.svg`, [`../dist/mnichols08-${variant}.svg`, 'image/svg+xml']);
createServer(async (req, res) => {
  const entry = allowed.get(new URL(req.url, 'http://localhost').pathname);
  if (!entry) { res.writeHead(404); res.end('Not found'); return; }
  try { res.setHeader('Content-Type', entry[1]); res.end(await readFile(new URL(entry[0], import.meta.url))); }
  catch { res.writeHead(500); res.end('Could not load preview'); }
}).listen(Number(process.env.PORT || 4173), '127.0.0.1', function () { console.log(`Preview: http://127.0.0.1:${this.address().port}`); });
