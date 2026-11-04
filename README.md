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

## O que já funciona

- **Dados reais do Docker:** descoberta, eventos (start/stop/die/health/oom…), CPU e RAM de cada
  container, ao vivo no navegador. Sem backend acessível, abre em **modo demonstração** com dados simulados.

- Escritório único em 3D (Three.js): baias individuais com divisórias, copa com sofá e TV, café,
  bebedouro, estante, quadro branco, impressora, janelas com vista da cidade, relógio com a hora real e
  pôsteres de papel da cultura dev nas paredes.
- **34 personagens** gerados em código, sem assets externos. Cada um tem roupa, acessório, mesa e decoração.
  Container sem perfil ganha um **funcionário novo** com visual fixo, calculado a partir do nome. A label
  `docker-office.character=<id>` escolhe o personagem manualmente.
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
- **Acesso sem complicação:** na primeira visita você escolhe criar uma senha ou deixar aberto.
- **Busca** (atalho `/`): digite o nome e a câmera vai até o personagem.
- **Avisos:** notificação do navegador quando um container entra em erro (opcional; no máximo 1 a cada
  2 min por container).
- **Dia e noite:** a vista da janela e a luz seguem a hora local (`?time=day|night` força um dos dois).
- **Detalhes no hover:** estado Docker, uptime, CPU, RAM, reinícios, código de saída, imagem, portas e
  último evento.

### Como o estado é decidido

| Estado | Quando |
|---|---|
| **erro** | `dead`, OOM, `unhealthy`, reiniciando sem parar (≥ 3 reinícios em 5 min) ou saiu com código ≠ 0 sem ninguém mandar parar |
| **parado** | parado por `docker stop`/`kill`, terminou com exit 0, criado e nunca iniciado, ou pausado |
| **ocupado** | CPU ≥ 70% por 3 amostras seguidas (só sai com < 50% por 3) ou memória ≥ 90% do limite |
| **trabalhando** | rodando, sem nada acima |

Quando o Docker Engine cai, as luzes do escritório apagam. O backend tenta reconectar sozinho (1 s → 30 s) e
não perde o que aconteceu no meio: reabre os eventos com `since` e reconcilia a lista.

## Roadmap

- [x] Backend Docker: descoberta, eventos, métricas, estado "ocupado" com histerese
- [x] Resiliência: reconexão ao Engine, reconciliação e status "reconectando"
- [x] Deploy containerizado com docker-socket-proxy e token
- [ ] Agrupar personagens por label (`docker-office.room`)
- [ ] Histórico curto de métricas no servidor (hoje o gráfico começa ao abrir a página)
- [ ] Vários hosts Docker no mesmo escritório

## Como rodar

Requer Node.js ≥ 22.

```sh
npm install
npm run dev          # compila o frontend e sobe o servidor, lendo o Docker local
npm run demo         # mesmo servidor, mas com dados simulados (não toca no Docker)
npm test             # testes do classificador, métricas, eventos e parser
```

Em desenvolvimento o servidor usa o socket local (`/var/run/docker.sock`), então seu usuário precisa estar
no grupo `docker`. Abra `http://localhost:8421` (`dev` e `demo` usam a 8421 para não brigar com um deploy
na 8420; `PORT=…` muda). Parâmetros de URL úteis:

- `?cam=iso|top|side|below|free`: câmera inicial
- `&focus=<nome-do-container>`: já começa seguindo um personagem
- `?demo=1`: força os dados simulados
- `?token=…`: token de acesso, se você usa `DOCKER_OFFICE_TOKEN` (fica salvo no navegador e some da barra de endereço)

Variáveis de ambiente do servidor: `PORT` (8420), `HOST` (0.0.0.0), `DOCKER_HOST` (`unix://…` ou
`tcp://…`), `DOCKER_OFFICE_TOKEN`, `DOCKER_OFFICE_DATA` (pasta do `auth.json`; `./data` no dev), `DOCKER_OFFICE_DEMO=1`, `METRICS_INTERVAL_MS` (3000) e `MAX_CLIENTS` (50).

Por padrão o servidor escuta em `0.0.0.0` (acesso pela rede local). Para restringir à própria máquina:

```sh
HOST=127.0.0.1 npm run serve
```

## Rodar no servidor (Docker)

```sh
git clone https://github.com/DeathHapyness/Docker-Office.git
cd Docker-Office
cp deploy/.env.example deploy/.env
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
```

Abra `http://<ip-do-servidor>:8420`. Na **primeira visita** o Docker Office pergunta:

- **Proteger com senha:** cada navegador pede a senha uma vez e lembra por 90 dias.
- **Deixar aberto:** qualquer pessoa na sua rede vê o painel, sem login.

A escolha fica no volume `data` (só o hash scrypt da senha, nunca a senha). Para trocar a senha ou voltar à
pergunta, apague o arquivo e reinicie:

```sh
docker exec docker-office-docker-office-1 rm /data/auth.json && docker restart docker-office-docker-office-1
```

> Quem abrir a página primeiro faz a escolha. Abra logo depois de subir, antes de divulgar o endereço.
> Prefere um token fixo? Defina `DOCKER_OFFICE_TOKEN` (16+ caracteres) no `deploy/.env`: a pergunta some e
> o login pede esse token.

O compose sobe dois containers:

- **`socket-proxy`** ([Tecnativa](https://github.com/Tecnativa/docker-socket-proxy)): o único que monta o
  socket do Docker. Libera só leitura de containers e eventos (`POST=0`). Fica numa rede interna, sem porta
  publicada.
- **`docker-office`**: fala com o proxy por `tcp://socket-proxy:2375`. Nunca vê o socket. Roda como usuário
  sem privilégios, com sistema de arquivos somente leitura, sem capabilities e com limite de 192 MB de RAM e
  meio núcleo.

Para atualizar, use `git pull` e rode o mesmo `docker compose … up -d --build`.

Sem Docker, com Node ≥ 22.18: `npm ci && npm run build:web && npm run serve`.

**Problemas comuns**

- `all predefined address pools have been fully subnetted`: o Docker do servidor já usou todas as
  sub-redes automáticas, porque cada projeto compose cria a sua. Suba com sub-redes fixas:
  `docker compose --env-file deploy/.env -f deploy/compose.yml -f deploy/compose.subnets.yml up -d --build`.
  Se `10.254.0.0/28` já for usado na sua rede, troque em `deploy/.env` (veja o arquivo). Outra saída é
  `docker network prune`, que apaga só redes sem nenhum container.
- `open …/docker-compose.prod.yml: no such file or directory` ao rodar só `docker compose up`: a variável
  `COMPOSE_FILE` do seu shell aponta para outro projeto. Passe sempre `-f deploy/compose.yml`.

## Extensão para o navegador (nova aba)

A extensão em [`extras/newtab-extension`](extras/newtab-extension) troca a página de nova aba pelo
Docker Office em modo papel de parede: sem botões, câmera girando devagar e 20 FPS. Se o servidor estiver
fora do ar, ela mostra um aviso com o botão **Tentar de novo**.

**Instalação:**

1. Suba o servidor.
2. Em `chrome://extensions`, ligue o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha `extras/newtab-extension`.
4. Nas opções da extensão, informe `http://<ip-do-servidor>:8420/?wallpaper=1`. Com senha, o login aparece
   na primeira nova aba e fica lembrado.

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

- **Servidor:** com 32 containers reais, ~0,3% de 1 núcleo e ~100 MB de RAM. O Docker gasta ~2% de 1
  núcleo respondendo às métricas, coletadas a cada 3 s, só dos containers rodando, 4 por vez.
- **Rede:** um lote de métricas a cada 3 s (alguns KB). Mudanças de estado chegam em ~0,1–0,3 s.
- **Download:** ~420 KB no primeiro acesso (gzip). Nos acessos seguintes vem quase só `304 Not Modified`.
- **Sem GPU** (renderização por software), o 3D cai para ~6 FPS. Em máquinas fracas, use `?fps=15`.
- **Aba em segundo plano:** o navegador pausa a animação e o custo cai para zero.

## Arquitetura

```
Docker Engine ──(socket-proxy, somente leitura)──► Backend Node/TS ──SSE──► Frontend estático
                                                   /api/events               Three.js + TS (sem bundler)
```

- `server/src/docker/`: cliente HTTP da API Docker (`node:http`), parser NDJSON e o `Engine`
  (eventos, reconexão com backoff e coleta de métricas)
- `server/src/domain/`: estado em memória, classificador e cálculo de CPU/RAM (lógica pura, testada)
- `server/src/http/`: arquivos estáticos (gzip + ETag) e Server-Sent Events

- `web/src/scene/`: cena, câmeras e loop
- `web/src/characters/`: rig voxel articulado montado a partir de dados
- `web/src/office/`: layout automático, móveis e objetos
- `web/src/sim/`: agentes (decisão e animação) e navegação A*
- `web/src/screens/`: telas em canvas (monitores, TV, painel e relógio)
- `web/src/net/live.ts`: conexão ao vivo (o `EventSource` do navegador já reconecta sozinho)

Dependências de runtime: **`three`** (versão exata) e mais nada. O backend roda TypeScript direto no
Node 22.18+ (*type stripping*), sem `dockerode`, sem `ws` e sem passo de build. Os testes usam `node:test`.

## Segurança

- **Acesso ao socket do Docker equivale a root no host.** O socket nunca é exposto ao navegador. No
  deploy, só o [docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) monta o socket, com
  permissões **somente de leitura** (`CONTAINERS=1 EVENTS=1 PING=1 VERSION=1 POST=0`), numa rede interna
  sem porta publicada. Testado: `POST /containers/…/stop` e `GET /images` voltam `403`.
- A interface é **somente leitura**: não há start, stop nem exec. O servidor só chama `GET` na API Docker.
- **Senha:** escolhida na primeira visita e guardada como hash scrypt com sal (arquivo `0600`). O login
  devolve uma sessão assinada com HMAC, válida por 90 dias; trocar a senha derruba todas. São no máximo 10
  tentativas erradas a cada 5 min por IP. Os POSTs exigem `application/json` e a mesma origem, o que barra
  formulários de outros sites.
- **Token fixo (opcional):** com `DOCKER_OFFICE_TOKEN` (mínimo 16 caracteres), `/api/*` exige o token
  (comparação em tempo constante) e a escolha inicial não aparece.
- **Aberto:** se escolher sem senha, qualquer um na LAN vê nomes, imagens e portas dos seus containers.
- Não exponha o Docker Office à internet. Ele foi pensado para a LAN.
- O servidor só aceita `POST` em `/api/setup` e `/api/login`; os arquivos estáticos só aceitam `GET`/`HEAD`.
  Ele bloqueia path traversal e envia os cabeçalhos `nosniff` e `no-referrer`. O `frame-ancestors` só deixa
  a própria página e extensões de navegador embutirem o app.
- Os dados vindos do Docker (nomes, labels, imagens) são inseridos no DOM só como texto (`textContent`).

## Licença

[MIT](LICENSE)
