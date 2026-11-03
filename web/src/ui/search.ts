/** Busca por personagem/container: digite o nome (atalho "/") e a câmera vai até ele. */
export interface DirEntry { id: string; name: string; container: string }

export class Search {
  onPick: (id: string) => void = () => {};
  private readonly input: HTMLInputElement;
  private readonly list: HTMLDataListElement;
  private readonly dir: () => DirEntry[];

  constructor(input: HTMLInputElement, dir: () => DirEntry[]) {
    this.input = input;
    this.dir = dir;
    this.list = document.createElement('datalist');
    this.list.id = 'search-list';
    input.setAttribute('list', this.list.id);
    input.after(this.list);
    input.addEventListener('focus', () => this.fill());
    input.addEventListener('change', () => this.go());
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') this.go();
      if (ev.key === 'Escape') input.blur();
    });
    document.addEventListener('keydown', (ev) => {
      const t = ev.target as HTMLElement;
      if (ev.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) {
        ev.preventDefault();
        input.focus();
      }
    });
  }

  private fill(): void {
    const opts = this.dir()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((d) => {
        const o = document.createElement('option');
        o.value = d.name;
        if (d.container !== d.name) o.label = d.container;
        return o;
      });
    this.list.replaceChildren(...opts);
  }

  private go(): void {
    const q = this.input.value.trim().toLowerCase();
    if (!q) return;
    const all = this.dir();
    const hit = all.find((d) => d.name.toLowerCase() === q || d.container.toLowerCase() === q)
      ?? all.find((d) => d.name.toLowerCase().includes(q) || d.container.toLowerCase().includes(q));
    this.input.dataset.miss = hit ? '' : '1';
    if (!hit) return;
    this.onPick(hit.id);
    this.input.value = '';
    this.input.blur();
  }
}
