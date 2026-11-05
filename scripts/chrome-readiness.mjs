import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

// Cold Linux runners can take longer than 15 s to start Chrome. A port file
// alone is not readiness: it can be incomplete or precede the first page target.
// This deadline applies only to startup, never to browser assertions.
export async function waitForChromePage(chrome, profile, {
  timeoutMs = 45000, pollMs = 100, stderr = () => ''
} = {}) {
  const started = performance.now();
  const portFile = path.join(profile, 'DevToolsActivePort');
  let spawnError, lastState = 'DevToolsActivePort not written';
  const onError = error => { spawnError = error; };
  chrome.on('error', onError);
  const failure = reason => new Error(`Chrome startup failed after ${Math.round(performance.now()-started)} ms: ${reason}\n${stderr()}`);
  const checkProcess = () => {
    if (spawnError) throw failure(`spawn: ${spawnError.message}`);
    if (chrome.exitCode != null || chrome.signalCode != null)
      throw failure(`process exited (code=${chrome.exitCode}, signal=${chrome.signalCode})`);
  };
  try {
    while (performance.now()-started < timeoutMs) {
      checkProcess();
      let port;
      try {
        const contents = fs.readFileSync(portFile, 'utf8');
        // Require the complete first line; a partial write must not become a port.
        const match = contents.match(/^(\d+)\r?\n/);
        if (match && +match[1] > 0 && +match[1] <= 65535) port = +match[1];
        else lastState = 'DevToolsActivePort incomplete';
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (port) {
        try {
          const remaining = Math.max(1, Math.ceil(timeoutMs-(performance.now()-started)));
          const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
            signal: AbortSignal.timeout(Math.min(1000, remaining))
          });
          if (!response.ok) throw new Error(`DevTools HTTP ${response.status}`);
          const targets = await response.json();
          const page = Array.isArray(targets) && targets.find(target =>
            target.type === 'page' && typeof target.webSocketDebuggerUrl === 'string');
          checkProcess();
          if (page && performance.now()-started < timeoutMs) {
            console.log(`Chrome ready in ${Math.round(performance.now()-started)} ms`);
            return page.webSocketDebuggerUrl;
          }
          lastState = 'DevTools has no page target yet';
        } catch (error) {
          checkProcess();
          lastState = error.message;
        }
      }
      await sleep(Math.min(pollMs, Math.max(0, timeoutMs-(performance.now()-started))));
    }
    checkProcess();
    throw failure(`deadline ${timeoutMs} ms exceeded; ${lastState}`);
  } finally {
    chrome.off('error', onError);
  }
}
