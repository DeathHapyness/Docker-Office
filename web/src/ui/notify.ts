/**
 * Avisos do navegador quando algo quebra (opcional, desligado por padrão).
 * Só notifica entradas de nível "error" do log e no máximo 1 por container a cada 2 min.
 */
import type { EventLog, LogEntry } from '../state/event-log.js';

const KEY = 'docker-office:notify';

export class Notifier {
  private on = false;
  private readonly last = new Map<string, number>();
  private readonly button: HTMLButtonElement;

  constructor(log: EventLog, button: HTMLButtonElement) {
    this.button = button;
    if (!('Notification' in window)) {
      button.hidden = true;
      return;
    }
    try { this.on = localStorage.getItem(KEY) === '1' && Notification.permission === 'granted'; } catch { /* sem storage */ }
    this.mark();
    button.addEventListener('click', () => void this.toggle());
    log.subscribe((e) => this.maybeNotify(e));
  }

  private async toggle(): Promise<void> {
    if (!this.on && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') {
        this.button.title = 'O navegador bloqueou as notificações deste site';
        return;
      }
    }
    this.on = !this.on;
    try { localStorage.setItem(KEY, this.on ? '1' : '0'); } catch { /* sem storage */ }
    this.mark();
  }

  private mark(): void {
    this.button.setAttribute('aria-pressed', String(this.on));
    this.button.title = this.on ? 'Avisos ligados: notifica quando um container cai' : 'Ligar avisos do navegador quando algo quebrar';
  }

  private maybeNotify(e: LogEntry): void {
    if (!this.on || e.level !== 'error' || e.kind === 'system') return;
    const key = e.containerId ?? e.kind;
    const now = Date.now();
    if (now - (this.last.get(key) ?? 0) < 120_000) return;
    this.last.set(key, now);
    try {
      new Notification(`Docker Office — ${e.who ?? 'Docker'}`, { body: `${e.text}${e.detail ? ` (${e.detail})` : ''}`, tag: key });
    } catch { /* alguns navegadores só notificam via service worker */ }
  }
}
