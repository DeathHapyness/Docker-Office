/**
 * Acesso ao painel. Na primeira visita a pessoa escolhe: criar uma senha ou deixar aberto.
 *
 *  - setup:    ainda não configurado → só /api/auth e /api/setup respondem
 *  - open:     sem senha (qualquer um na rede vê)
 *  - password: senha (scrypt + sal) → login devolve uma sessão assinada (HMAC) que vale 90 dias
 *  - token:    DOCKER_OFFICE_TOKEN no ambiente (modo antigo; ignora o arquivo)
 *
 * O arquivo fica em DOCKER_OFFICE_DATA (volume no Docker). Para trocar a senha ou voltar à escolha
 * inicial, apague auth.json e reinicie. Sessões são stateless: trocar a senha gera um novo segredo
 * e derruba todas.
 */
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export type AuthMode = 'setup' | 'open' | 'password' | 'token';

interface Stored {
  mode: 'open' | 'password';
  salt?: string;
  hash?: string;
  secret?: string;
}

export const MIN_PASSWORD = 8;
const SESSION_DAYS = 90;
const MAX_FAILS = 10;
const FAIL_WINDOW_MS = 5 * 60_000;

const b64 = (b: Buffer): string => b.toString('base64url');

function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export class Auth {
  private readonly file: string;
  private readonly dir: string;
  private readonly envToken: string;
  private stored?: Stored;
  private readonly fails = new Map<string, number[]>();

  constructor(dir: string, envToken = '') {
    this.dir = dir;
    this.file = join(dir, 'auth.json');
    this.envToken = envToken;
  }

  async load(): Promise<void> {
    if (this.envToken) return;
    try {
      const s = JSON.parse(await readFile(this.file, 'utf8')) as Stored;
      if (s.mode === 'open' || (s.mode === 'password' && s.salt && s.hash && s.secret)) this.stored = s;
      else console.warn(`[auth] ${this.file} inválido — voltando à configuração inicial`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.warn(`[auth] não consegui ler ${this.file}: ${(err as Error).message}`);
    }
  }

  get mode(): AuthMode {
    if (this.envToken) return 'token';
    return this.stored?.mode ?? 'setup';
  }

  /** O token/sessão dá acesso a /api/*? */
  check(given: string): boolean {
    switch (this.mode) {
      case 'open': return true;
      case 'setup': return false;
      case 'token': return same(given, this.envToken);
      case 'password': return this.verifySession(given);
    }
  }

  /** Primeira configuração. Devolve a sessão (com senha) ou '' (aberto). */
  async setup(choice: 'open' | 'password', password = ''): Promise<string> {
    if (this.mode !== 'setup') throw new AuthError(409, 'O acesso já foi configurado');
    let s: Stored;
    if (choice === 'open') {
      s = { mode: 'open' };
    } else {
      if (password.length < MIN_PASSWORD) throw new AuthError(400, `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres`);
      if (password.length > 256) throw new AuthError(400, 'Senha longa demais');
      const salt = randomBytes(16);
      s = { mode: 'password', salt: b64(salt), hash: b64(await scrypt(password, salt, 32)), secret: b64(randomBytes(32)) };
    }
    await this.save(s);
    this.stored = s;
    return choice === 'password' ? this.session() : '';
  }

  /** Login com senha (ou com o DOCKER_OFFICE_TOKEN no modo token). Limita tentativas por IP. */
  async login(password: string, ip: string): Promise<string> {
    const now = Date.now();
    const recent = (this.fails.get(ip) ?? []).filter((t) => now - t < FAIL_WINDOW_MS);
    if (recent.length >= MAX_FAILS) throw new AuthError(429, 'Muitas tentativas. Espere alguns minutos.');
    let ok = false;
    if (this.mode === 'token') ok = same(password, this.envToken);
    else if (this.mode === 'password' && this.stored?.salt && this.stored.hash && password.length <= 256) {
      const hash = await scrypt(password, Buffer.from(this.stored.salt, 'base64url'), 32);
      ok = timingSafeEqual(hash, Buffer.from(this.stored.hash, 'base64url'));
    }
    if (!ok) {
      recent.push(now);
      this.fails.set(ip, recent);
      if (this.fails.size > 10_000) this.fails.clear(); // não deixa crescer sem limite
      throw new AuthError(401, this.mode === 'token' ? 'Token incorreto' : 'Senha incorreta');
    }
    this.fails.delete(ip);
    return this.mode === 'token' ? this.envToken : this.session();
  }

  private session(): string {
    const exp = String(Date.now() + SESSION_DAYS * 86_400_000);
    return `${exp}.${this.sign(exp)}`;
  }

  private verifySession(token: string): boolean {
    const [exp, sig] = token.split('.');
    if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
    return same(sig, this.sign(exp));
  }

  private sign(data: string): string {
    return b64(createHmac('sha256', Buffer.from(this.stored?.secret ?? '', 'base64url')).update(data).digest());
  }

  private async save(s: Stored): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify(s), { mode: 0o600 });
      await rename(tmp, this.file);
    } catch (err) {
      throw new AuthError(500, `Não consegui salvar a configuração em ${this.dir}: ${(err as Error).message}`);
    }
  }
}

export class AuthError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
