/**
 * Divide um stream NDJSON (eventos do Docker) em objetos. Os pedaços chegam fragmentados:
 * uma linha pode vir quebrada em vários chunks, ou vários eventos num chunk só.
 */
export class NdjsonSplitter {
  private buf = '';
  private readonly decoder = new TextDecoder();

  private readonly onObject: (o: unknown) => void;
  private readonly onBadLine?: (line: string) => void;

  constructor(onObject: (o: unknown) => void, onBadLine?: (line: string) => void) {
    this.onObject = onObject;
    this.onBadLine = onBadLine;
  }

  push(chunk: Uint8Array | string): void {
    this.buf += typeof chunk === 'string' ? chunk : this.decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (line) this.parse(line);
    }
    // proteção: uma "linha" gigante sem \n não pode crescer para sempre
    if (this.buf.length > 1_000_000) this.buf = '';
  }

  /** Fim do stream: processa o que sobrou sem \n final. */
  end(): void {
    const line = this.buf.trim();
    this.buf = '';
    if (line) this.parse(line);
  }

  private parse(line: string): void {
    try {
      this.onObject(JSON.parse(line));
    } catch {
      this.onBadLine?.(line);
    }
  }
}
