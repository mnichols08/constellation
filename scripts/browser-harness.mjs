import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
export const browser = process.env.CONSTELLATION_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => existsSync(path));


export async function openBrowser(t, url) {
  const profile = await mkdtemp(join(tmpdir(), 'constellation-browser-'));
  // Hosted Linux runners restrict Chrome's namespace sandbox. This isolated
  // test browser only loads our localhost fixtures and uses a disposable profile.
  const runnerArgs = process.env.GITHUB_ACTIONS === 'true' && process.platform === 'linux' ? ['--no-sandbox'] : [];
  const child = spawn(browser, ['--headless=new', ...runnerArgs, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let launchError = '', diagnostics = '';
  child.on('error', error => { launchError = error.message; });
  child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-8000); });
  let socket, cdp;
  t.after(async () => {
    if (cdp) try { await cdp('Browser.close'); } catch {}
    socket?.close(); child.kill();
    for (let i = 0; i < 20; i++) { try { await rm(profile, { recursive: true, force: true }); break; } catch { await delay(100); } }
  });
  let port;
  for (let i = 0; i < 150; i++) {
    if (launchError || child.exitCode !== null) break;
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(100); }
  }
  assert.ok(port, `Chromium did not start: ${launchError || diagnostics || 'DevTools port unavailable'}`);
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let next = 0; const pending = new Map(), errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    const item = pending.get(message.id); if (!item) return;
    pending.delete(message.id); clearTimeout(item.timer); message.error ? item.reject(Error(message.error.message)) : item.resolve(message.result);
  });
  cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = ++next; pending.set(id, { resolve, reject, timer: setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 10000) }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const value = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (value.exceptionDetails) throw Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text); return value.result.value; };
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Page.navigate', { url });
  const waitFor = async expression => { for (let i=0;i<100;i++) { if (await evaluate(expression)) return; await delay(100); } throw Error('Browser condition timed out: '+expression); };
  return { cdp, evaluate, errors, waitFor };
}
