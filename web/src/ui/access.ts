/**
 * Acesso ao painel. Na primeira visita: criar senha ou deixar aberto. Depois, se houver senha,
 * pede uma vez por navegador (a sessão fica no localStorage por 90 dias).
 * Diálogo modal nativo (<dialog> + showModal): foco, inert e top layer vêm do navegador.
 */

export type AccessMode = 'setup' | 'open' | 'password' | 'token';

interface AuthInfo {
  mode: AccessMode;
  authed: boolean;
  minPassword: number;
}

const KEY = 'docker-office:token';

export function savedToken(): string {
  try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; }
}

export function saveToken(token: string): void {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch { /* modo privado: vale só nesta aba */ }
}

async function info(token: string): Promise<AuthInfo | undefined> {
  try {
    const res = await fetch(`api/auth${token ? `?token=${encodeURIComponent(token)}` : ''}`, { cache: 'no-store' });
    if (!res.ok) return undefined;
    return (await res.json()) as AuthInfo;
  } catch {
    return undefined; // sem backend (arquivos estáticos): segue para o modo demonstração
  }
}

async function post(path: string, body: unknown): Promise<{ token?: string; error?: string }> {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
    return res.ok ? data : { error: data.error ?? `Erro ${res.status}` };
  } catch {
    return { error: 'Sem conexão com o servidor' };
  }
}

/**
 * Garante o acesso antes de abrir o escritório. Devolve o token a usar na API
 * ('' = aberto ou sem backend).
 */
export async function ensureAccess(token: string): Promise<string> {
  const a = await info(token);
  if (!a) return token;
  if (a.mode === 'open') return '';
  if (a.authed) return token;
  const next = a.mode === 'setup' ? await setupDialog(a.minPassword) : await loginDialog(a.mode === 'token');
  saveToken(next);
  return next;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: Array<Node | string>): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

/** Campo de senha com "Mostrar senha" (sem pedir para digitar duas vezes). */
function passwordField(id: string, label: string, autocomplete: 'new-password' | 'current-password', min: number): {
  wrap: HTMLElement; input: HTMLInputElement;
} {
  const input = el('input', { type: 'password', id, name: 'password', required: true, autofocus: true, spellcheck: false });
  input.autocomplete = autocomplete;
  input.enterKeyHint = 'done';
  if (min) input.minLength = min;
  const show = el('input', { type: 'checkbox', id: `${id}-show` });
  show.addEventListener('change', () => { input.type = show.checked ? 'text' : 'password'; });
  const wrap = el('div', { className: 'access__field' },
    el('label', { htmlFor: id }, label),
    input,
    el('label', { className: 'access__show' }, show, 'Mostrar senha'),
  );
  return { wrap, input };
}

/** Usuário fixo e invisível: ajuda o gerenciador de senhas a salvar e preencher. */
const hiddenUser = (): HTMLInputElement =>
  el('input', { type: 'text', name: 'username', value: 'docker-office', autocomplete: 'username', hidden: true, readOnly: true });

function openDialog(title: string, ...body: Node[]): { dialog: HTMLDialogElement; error: HTMLElement } {
  const titleId = `access-title-${Math.random().toString(36).slice(2)}`;
  const error = el('p', { className: 'access__error' });
  error.setAttribute('role', 'alert');
  const dialog = el('dialog', { className: 'access' }, el('h2', { id: titleId }, title), ...body, error);
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.setAttribute('closedby', 'none');
  // sem acesso não há o que mostrar: Esc não fecha
  dialog.addEventListener('cancel', (e) => e.preventDefault());
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, error };
}

function setupDialog(min: number): Promise<string> {
  return new Promise((resolve) => {
    const pw = passwordField('access-new', 'Criar senha', 'new-password', min);
    const save = el('button', { type: 'submit', className: 'access__primary' }, 'Proteger com senha');
    const form = el('form', { className: 'access__form' }, hiddenUser(), pw.wrap,
      el('p', { className: 'access__hint' }, `Mínimo de ${min} caracteres. Cada navegador pede a senha uma vez.`), save);
    const open = el('button', { type: 'button', className: 'access__secondary' }, 'Deixar aberto, sem senha');
    const { dialog, error } = openDialog('Bem-vindo ao Docker Office',
      el('p', {}, 'Primeira vez aqui. Escolha como proteger o painel.'),
      form,
      el('div', { className: 'access__or' }, 'ou'),
      open,
      el('p', { className: 'access__hint' }, 'Aberto: qualquer pessoa na sua rede vê nomes, imagens e portas dos containers.'),
    );
    const finish = async (body: unknown, btn: HTMLButtonElement): Promise<void> => {
      btn.disabled = true;
      error.textContent = '';
      const r = await post('api/setup', body);
      btn.disabled = false;
      if (r.error) {
        error.textContent = r.error;
        return;
      }
      dialog.close();
      dialog.remove();
      resolve(r.token ?? '');
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void finish({ mode: 'password', password: pw.input.value }, save);
    });
    open.addEventListener('click', () => void finish({ mode: 'open' }, open));
  });
}

function loginDialog(tokenMode: boolean): Promise<string> {
  return new Promise((resolve) => {
    const what = tokenMode ? 'Token' : 'Senha';
    const pw = passwordField('access-current', what, 'current-password', 0);
    const enter = el('button', { type: 'submit', className: 'access__primary' }, 'Entrar');
    const form = el('form', { className: 'access__form' }, hiddenUser(), pw.wrap, enter);
    const { dialog, error } = openDialog('Docker Office',
      el('p', {}, tokenMode ? 'Este painel exige o token definido em DOCKER_OFFICE_TOKEN.' : 'Este painel tem senha.'),
      form,
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      enter.disabled = true;
      error.textContent = '';
      const r = await post('api/login', { password: pw.input.value });
      enter.disabled = false;
      if (r.error || !r.token) {
        error.textContent = r.error ?? 'Não deu certo';
        pw.input.select();
        return;
      }
      dialog.close();
      dialog.remove();
      resolve(r.token);
    });
  });
}
