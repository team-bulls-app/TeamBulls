import assert from 'node:assert/strict';
import {test} from 'node:test';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {waitForChromePage} from './chrome-readiness.mjs';

async function fixture(t, respond = (_req, res) => res.end(JSON.stringify([
  {type:'page', webSocketDebuggerUrl:'ws://127.0.0.1/devtools/page/fixture'}
]))) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-chrome-readiness-'));
  const chrome = Object.assign(new EventEmitter(), {exitCode:null, signalCode:null});
  const server = http.createServer(respond);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(profile, {recursive:true, force:true});
    assert.equal(chrome.listenerCount('error'), 0, 'Startup listener must be removed');
  });
  const write = value => fs.writeFileSync(path.join(profile, 'DevToolsActivePort'), value);
  const publish = () => write(`${server.address().port}\n/devtools/browser/fixture\n`);
  return {profile, chrome, server, write, publish};
}

test('cold browser can become ready after the former 15-second limit', async t => {
  const f = await fixture(t);
  const timer = setTimeout(f.publish, 16000);
  t.after(() => clearTimeout(timer));
  assert.equal(await waitForChromePage(f.chrome, f.profile), 'ws://127.0.0.1/devtools/page/fixture');
});

test('waits for complete port, valid HTTP response and a page target', async t => {
  let requests = 0;
  const f = await fixture(t, (_req, res) => {
    requests++;
    if (requests === 1) { res.writeHead(503); return res.end(); }
    if (requests === 2) return res.end('not JSON yet');
    res.end(JSON.stringify(requests === 3 ? [{type:'browser'}] : [
      {type:'page', webSocketDebuggerUrl:'ws://127.0.0.1/devtools/page/fixture'}
    ]));
  });
  f.write('12');
  const timer = setTimeout(f.publish, 100);
  t.after(() => clearTimeout(timer));
  assert.match(await waitForChromePage(f.chrome, f.profile, {timeoutMs:3000, pollMs:20}), /\/page\/fixture$/);
  assert.equal(requests, 4);
});

test('process exit fails immediately and includes stderr', async t => {
  const f = await fixture(t);
  f.chrome.exitCode = 1;
  await assert.rejects(waitForChromePage(f.chrome, f.profile, {stderr:()=>'fatal launch error'}), /process exited.*\nfatal launch error/);
});

test('process killed by a signal does not wait for deadline', async t => {
  const f = await fixture(t);
  f.chrome.signalCode = 'SIGTERM';
  await assert.rejects(waitForChromePage(f.chrome, f.profile), /signal=SIGTERM/);
});

test('spawn errors reject rather than becoming unhandled events', async t => {
  const f = await fixture(t);
  const result = waitForChromePage(f.chrome, f.profile, {pollMs:10});
  f.chrome.emit('error', new Error('ENOENT'));
  await assert.rejects(result, /spawn: ENOENT/);
});

test('missing port fails at bounded deadline with diagnostics', async t => {
  const f = await fixture(t);
  await assert.rejects(waitForChromePage(f.chrome, f.profile, {timeoutMs:100, pollMs:10, stderr:()=>'browser log'}), /deadline 100 ms exceeded; DevToolsActivePort not written\nbrowser log/);
});

test('hung DevTools response cannot bypass startup deadline', async t => {
  const f = await fixture(t, () => {});
  f.publish();
  const started = performance.now();
  await assert.rejects(waitForChromePage(f.chrome, f.profile, {timeoutMs:150, pollMs:10}), /deadline 150 ms exceeded/);
  assert(performance.now()-started < 2000, 'Hung HTTP response must be aborted');
});
