# Docker Office

> [!WARNING]
> **Este projeto foi criado com agentes de IA.** O código, a arte (gerada em código), a documentação e
> as decisões de arquitetura foram produzidos por agentes de IA (Claude Code), com direção e revisão
> humana. Revise antes de usar em produção, especialmente o que toca no socket do Docker.

Monitoramento de containers Docker com visual de **escritório 3D em voxels**. Cada container vira um
**funcionário** com personagem, mesa e manias próprias. O comportamento dele mostra o estado real do
serviço.

| Container | Personagem |
|---|---|
| AdGuard Home | super-herói musculoso de camiseta verde, vigia a porta |
| Grafana | o nerd do TI, aponta para o painel de gráficos |
| Jellyfin | cinéfilo com pipoca, assiste à TV da copa |
| …e mais 29 | cada serviço da stack tem perfil próprio em `web/config/characters.json` |

## O que já funciona (protótipo)

- Escritório único em 3D (Three.js): baias individuais com divisórias, copa com sofá e TV, café,
  bebedouro, estante, quadro branco, impressora, janelas com vista da cidade e relógio com a hora real.
- **32 personagens** gerados em código, sem assets externos. Cada um tem roupa, acessório, mesa e decoração.
- Comportamento por estado:
  - **ocioso:** café, janela, conversa, manias do perfil;
  - **trabalhando:** digita;
  - **ocupado:** corre e digita rápido;
  - **parado:** dorme;
  - **erro:** entra em pânico.
- **Telas com dados:**
  - **monitores:** CPU com histórico, RAM, uptime e health; tela de erro ":(" com código de saída;
  - **TV "Docker News":** resumo, ranking de CPU e notícias dos eventos;
  - **painel de métricas:** gráfico de CPU dos 6 serviços mais ativos e ranking de memória.
- **Câmera livre 360°**, inclusive por baixo do piso, com presets. Clique num personagem para segui-lo: na
  mesa, a câmera vai por cima do ombro para mostrar a tela.
- **Detalhes no hover:** estado Docker, uptime, CPU, RAM, reinícios, código de saída, imagem, portas e
  último evento.

> **Estado atual:** o frontend roda com **dados simulados** (`web/src/demo/mock.ts`). O backend que lê o
> Docker de verdade (descoberta, eventos, métricas e WebSocket) é a próxima etapa. Veja o roadmap em
> [`AGENTS.md`](AGENTS.md).

## Como rodar

Requer Node.js ≥ 22.

```sh
npm install
npm run dev          # compila o TypeScript e sobe o servidor estático
```

Abra `http://localhost:8420`. Parâmetros de URL úteis:

- `?cam=iso|top|side|below|free`: câmera inicial
- `&focus=<nome-do-container>`: já começa seguindo um personagem

Por padrão o servidor escuta em `0.0.0.0` (acesso pela rede local). Para restringir à própria máquina:

```sh
HOST=127.0.0.1 npm run serve
```

## Arquitetura

```
Docker Engine ──(socket-proxy, somente leitura)──► Backend Node/TS ──WebSocket──► Frontend estático
                                                   (próxima etapa)                Three.js + TS (sem bundler)
```

- `web/src/scene/`: cena, câmeras e loop
- `web/src/characters/`: rig voxel articulado montado a partir de dados
- `web/src/office/`: layout automático, móveis e objetos
- `web/src/sim/`: agentes (decisão e animação) e navegação A*
- `web/src/screens/`: telas em canvas (monitores, TV, painel e relógio)
- `scripts/serve.mjs`: servidor estático com `node:http` (sem Express)

Dependências de runtime: **`three`** (versão exata). Nada de framework de UI.

## Segurança

- **Acesso ao socket do Docker equivale a root no host.** O socket nunca é exposto ao navegador. O
  backend planejado fala com o Docker através de um
  [docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) com permissões **somente de
  leitura** (`CONTAINERS=1 EVENTS=1 INFO=1 PING=1 VERSION=1 POST=0`), numa rede interna sem porta publicada.
- A interface é **somente leitura**: não há start, stop nem exec.
- Não exponha o Docker Office à internet. Ele foi pensado para a LAN e terá token no handshake do WebSocket.
- O servidor estático só aceita `GET`/`HEAD`, bloqueia path traversal e envia cabeçalhos `nosniff`,
  `no-referrer` e `frame-ancestors 'none'`.
- Os dados vindos do Docker (nomes, labels, imagens) são inseridos no DOM só como texto (`textContent`).

## Licença

[MIT](LICENSE)
