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

> [!TIP]
> **Tem extensão para o navegador!** A pasta [`extras/newtab-extension`](extras/newtab-extension) coloca o
> escritório como **plano de fundo de toda nova aba** no Chrome, Edge, Brave e Vivaldi. Veja
> [Extensão para o navegador](#extensão-para-o-navegador-nova-aba).

## O que já funciona (protótipo)

- Escritório único em 3D (Three.js): baias individuais com divisórias, copa com sofá e TV, café,
  bebedouro, estante, quadro branco, impressora, janelas com vista da cidade, relógio com a hora real e
  pôsteres de papel da cultura dev nas paredes.
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
- **Botão Log:** registra tudo o que mudou, como eventos Docker, trocas de estado, health, reinícios e
  quedas do Engine. Tem filtros (Docker, Estados, Problemas) e exportação para `.txt`. Clique numa linha
  para seguir o personagem.
- **Papel de parede do navegador:** `?wallpaper=1` tira a interface e gira a câmera devagar a 20 FPS. A
  extensão em [`extras/newtab-extension`](extras/newtab-extension) coloca isso em toda nova aba.
- **Detalhes no hover:** estado Docker, uptime, CPU, RAM, reinícios, código de saída, imagem, portas e
  último evento.

> **Estado atual:** o frontend roda com **dados simulados** (`web/src/demo/mock.ts`). O backend que lê o
> Docker de verdade (descoberta, eventos, métricas e WebSocket) é a próxima etapa.

## Roadmap

1. Protocolo WebSocket + servidor mock no mesmo protocolo
2. Backend Docker: descoberta, eventos (start/stop/die/health) e classificação de estado
3. Métricas (CPU/RAM via stats em stream) e estado "ocupado" com histerese
4. Resiliência: reconexão ao Engine, reconciliação e status "reconectando"
5. Deploy containerizado com docker-socket-proxy e token na LAN

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

## Rodar no servidor (Docker)

```sh
git clone https://github.com/DeathHapyness/Docker-Office.git
cd Docker-Office
docker compose -f deploy/compose.yml up -d --build
```

Abra `http://<ip-do-servidor>:8420`. O container roda como usuário sem privilégios, com sistema de
arquivos somente leitura, sem capabilities e com limite de 128 MB de RAM e meio núcleo. Para atualizar,
use `git pull && docker compose -f deploy/compose.yml up -d --build`.

Sem Docker, com Node ≥ 22: `npm ci && npm run build:web && npm run serve`.

## Extensão para o navegador (nova aba)

A extensão em [`extras/newtab-extension`](extras/newtab-extension) troca a página de nova aba pelo
Docker Office em modo papel de parede: sem botões, câmera girando devagar e 20 FPS. Se o servidor estiver
fora do ar, ela mostra um aviso com o botão **Tentar de novo**.

**Instalação:**

1. Suba o servidor.
2. Em `chrome://extensions`, ligue o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha `extras/newtab-extension`.
4. Nas opções da extensão, informe `http://<ip-do-servidor>:8420/?wallpaper=1`.

Na primeira nova aba o navegador pergunta se você quer manter a mudança: escolha **Manter**.

- **Permissões:** só `storage`, para guardar o endereço. A extensão não lê suas abas, seu histórico nem
  outros sites.
- **Modo de abertura:** por padrão o app abre dentro da nova aba, e a barra de endereço continua focada.
  Se a aba ficar em branco, mude nas opções para **Ir direto para o endereço**.
- **Compatibilidade:** Chrome, Edge, Brave, Vivaldi e outros Chromium. Ainda não está na Chrome Web Store;
  a instalação é manual.

Parâmetros úteis no endereço: `&fps=15`, `&orbit=0` (câmera parada) e
`&cam=top`.

## Desempenho

Medido em 2026-11-03 com os 32 personagens, Chrome 1400×900 e Radeon RX 6600 XT:

| | Tela normal | Papel de parede (`?wallpaper=1`) |
|---|---|---|
| FPS | 60 | 20 (limitado de propósito) |
| CPU do navegador (JS) | ~18% de 1 núcleo | ~7% de 1 núcleo |
| Memória JS | ~13 MB | ~10 MB |
| Draw calls por quadro | ~340 | ~340 (+ sombra a cada 3 quadros) |

- **Servidor:** ~17 MB de RAM e ~0% de CPU no container, porque ele só entrega arquivos.
- **Download:** ~420 KB no primeiro acesso (gzip). Nos acessos seguintes vem quase só `304 Not Modified`.
- **Sem GPU** (renderização por software), o 3D cai para ~6 FPS. Em máquinas fracas, use `?fps=15`.
- **Aba em segundo plano:** o navegador pausa a animação e o custo cai para zero.

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
- O servidor estático só aceita `GET`/`HEAD`, bloqueia path traversal e envia os cabeçalhos `nosniff` e
  `no-referrer`. O `frame-ancestors` só deixa a própria página e extensões de navegador embutirem o app.
- Os dados vindos do Docker (nomes, labels, imagens) são inseridos no DOM só como texto (`textContent`).

## Licença

[MIT](LICENSE)
