import { loadSettings } from './defaults.js';

const frame = document.getElementById('office');
const offline = document.getElementById('offline');

async function reachable(url) {
  try {
    // no-cors: só queremos saber se o servidor responde (resposta opaca é suficiente)
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(4000) });
    return true;
  } catch {
    return false;
  }
}

async function start() {
  const { url, mode } = await loadSettings();
  document.getElementById('url').textContent = url;
  if (!(await reachable(url))) {
    frame.hidden = true;
    offline.hidden = false;
    return;
  }
  if (mode === 'redirect') {
    location.replace(url);
    return;
  }
  offline.hidden = true;
  frame.hidden = false;
  frame.src = url;
}

document.getElementById('retry').addEventListener('click', () => start());
document.getElementById('options').addEventListener('click', async () => {
  try {
    await chrome.runtime.openOptionsPage();
  } catch (err) {
    console.error('Docker Office: não abriu as opções', err);
  }
});
start();
