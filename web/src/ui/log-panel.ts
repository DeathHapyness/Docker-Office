/** Painel lateral com o log do escritório (aberto pelo botão "Log" da barra de câmeras). */
import type { EventLog, LogEntry, LogKind } from '../state/event-log.js';

type Filter = 'all' | LogKind | 'problems';

const FILTERS: Array<[Filter, string]> = [
  ['all', 'Tudo'], ['docker', 'Docker'], ['state', 'Estados'], ['problems', 'Problemas'],
];

const time = (at: number): string =>
  new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export class LogPanel {
  private readonly el = document.createElement('aside');
  private readonly list = document.createElement('ol');
  private readonly empty = document.createElement('p');
  private filter: Filter = 'all';
  private unseen = 0;

  /** Chamado ao clicar numa linha ligada a um container. */
  onPick: (containerId: string) => void = () => {};

  constructor(private readonly log: EventLog, private readonly button: HTMLButtonElement) {
    this.el.className = 'logpanel';
    this.el.hidden = true;
    this.el.setAttribute('aria-label', 'Log do escritório');
    const head = document.createElement('header');
    const h = document.createElement('h2');
    h.textContent = 'Log do escritório';
    const close = document.createElement('button');
    close.className = 'close';
    close.title = 'Fechar (Esc)';
    close.textContent = '×';
    close.addEventListener('click', () => this.toggle(false));
    head.append(h, close);

    const bar = document.createElement('nav');
    bar.className = 'filters';
    for (const [f, label] of FILTERS) {
      const b = document.createElement('button');
      b.textContent = label;
      b.dataset.filter = f;
      b.setAttribute('aria-pressed', String(f === this.filter));
      b.addEventListener('click', () => {
        this.filter = f;
        for (const x of bar.querySelectorAll('button[data-filter]')) x.setAttribute('aria-pressed', String(x === b));
        this.renderAll();
      });
      bar.append(b);
    }
    const save = document.createElement('button');
    save.textContent = 'Exportar';
    save.title = 'Baixar o log como .txt';
    save.addEventListener('click', () => this.export());
    bar.append(save);

    this.empty.className = 'empty';
    this.empty.textContent = 'Nada aconteceu ainda.';
    this.el.append(head, bar, this.list, this.empty);
    document.body.append(this.el);

    this.list.addEventListener('click', (ev) => {
      const li = (ev.target as HTMLElement).closest<HTMLElement>('li[data-container]');
      if (li?.dataset.container) this.onPick(li.dataset.container);
    });
    button.addEventListener('click', () => this.toggle());
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !this.el.hidden) this.toggle(false);
    });
    log.subscribe((e) => {
      if (this.el.hidden) {
        this.unseen++;
        this.badge();
      } else if (this.matches(e)) {
        this.list.prepend(this.row(e));
        this.empty.hidden = true;
      }
    });
  }

  toggle(open = this.el.hidden): void {
    this.el.hidden = !open;
    this.button.setAttribute('aria-pressed', String(open));
    if (open) {
      this.unseen = 0;
      this.badge();
      this.renderAll();
    }
  }

  private badge(): void {
    this.button.dataset.count = this.unseen ? String(Math.min(this.unseen, 99)) : '';
  }

  private matches(e: LogEntry): boolean {
    if (this.filter === 'all') return true;
    if (this.filter === 'problems') return e.level === 'error' || e.level === 'warn';
    return e.kind === this.filter;
  }

  private renderAll(): void {
    const rows = this.log.entries.filter((e) => this.matches(e)).slice(-300).reverse().map((e) => this.row(e));
    this.list.replaceChildren(...rows);
    this.empty.hidden = rows.length > 0;
  }

  private row(e: LogEntry): HTMLLIElement {
    const li = document.createElement('li');
    li.dataset.level = e.level;
    if (e.containerId) {
      li.dataset.container = e.containerId;
      li.title = 'Clique para seguir este personagem';
    }
    const t = document.createElement('time');
    t.dateTime = new Date(e.at).toISOString();
    t.textContent = time(e.at);
    const msg = document.createElement('p');
    if (e.who) {
      const who = document.createElement('b');
      who.textContent = e.who;
      if (e.accent) who.style.color = e.accent;
      msg.append(who, ' ');
    }
    msg.append(e.text);
    li.append(t, msg);
    if (e.detail) {
      const d = document.createElement('small');
      d.textContent = e.detail;
      li.append(d);
    }
    return li;
  }

  private export(): void {
    const lines = this.log.entries.map((e) =>
      `${new Date(e.at).toISOString()} [${e.level}] [${e.kind}] ${e.who ? `${e.who}: ` : ''}${e.text}${e.detail ? ` (${e.detail})` : ''}`);
    const url = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `docker-office-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
