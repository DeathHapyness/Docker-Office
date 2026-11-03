import { DEFAULTS, loadSettings } from './defaults.js';

const form = document.getElementById('form');
const url = document.getElementById('url');
const status = document.getElementById('status');

const settings = await loadSettings();
url.value = settings.url;
form.querySelector(`input[name="mode"][value="${settings.mode}"]`)?.setAttribute('checked', '');

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const mode = new FormData(form).get('mode') ?? DEFAULTS.mode;
  try {
    const parsed = new URL(url.value);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('use http:// ou https://');
    await chrome.storage.sync.set({ url: parsed.href, mode });
    status.textContent = 'Salvo! Abra uma nova aba.';
  } catch (err) {
    status.textContent = `Não salvou: ${err.message}`;
  }
});
