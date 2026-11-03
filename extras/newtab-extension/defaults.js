// Configuração compartilhada entre a nova aba e a página de opções.
export const DEFAULTS = {
  url: 'http://localhost:8420/?wallpaper=1',
  mode: 'iframe', // 'iframe' mantém o foco na barra de endereço; 'redirect' abre a página direto
};

export async function loadSettings() {
  try {
    return { ...DEFAULTS, ...(await chrome.storage.sync.get(['url', 'mode'])) };
  } catch (err) {
    console.error('Docker Office: falha ao ler as opções', err);
    return { ...DEFAULTS };
  }
}
