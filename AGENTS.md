# AGENTS.md — Docker Office

Guia de continuidade para agentes de IA (Claude, Codex, Cursor etc.). Leia inteiro antes de agir.

## 1. O que é o projeto

Aplicação web de monitoramento Docker com visual de **escritório 2D**:
- Cada **container** = um **personagem** (nome acima da cabeça, indicador de status, acessório do serviço, animação conforme estado).
- Cada **grupo de containers** = uma **sala/departamento**.
- Precisão dos dados de monitoramento vem antes da estética.

## 2. Estado atual (2026-11-03)

- Etapa 1 (análise) concluída. **Protótipo visual 3D em andamento** (frontend com dados simulados; backend Docker ainda não existe).
- Repositório: https://github.com/DeathHapyness/Docker-Office (licença MIT). README avisa que o projeto é feito com agentes de IA.
- Mock com os **32 serviços** reais da stack (`web/src/demo/mock.ts`). **Sem salas/departamentos**: cada serviço tem baia própria (`office/layout.ts`, grade ordenada por nome).
- Telas com dados reais: monitor de cada mesa (`screens/monitor.ts`), TV "Docker News" + painel de métricas + relógio (`screens/wall.ts`). Clique num personagem sentado → câmera por cima do ombro mostrando a tela. `window.office` exposto para depuração.
- `dev/stack-test/test.env` é local (gitignored); copiar de `test.env.example`.
- **Sem assets externos**: tudo é gerado em código (voxels). Decisão do usuário: Plano B.
- Rodar: `npm install && npm run dev` → `http://<ip>:8420` (LAN). URL aceita `?cam=iso|top|side|below|free` e `&focus=<container>`.
- Stack real de teste: `dev/stack-test/` (overrides fora do repo monitorado; dados em `self-hosted-media-server/data/`, ignorado pelo git de lá).
- Fixture de eventos reais: `server/test/fixtures/events-lifecycle.ndjson` (healthcheck gera `exec_*` a cada 30 s → filtrar; `stop` chega antes de `die`).

### Decisões do usuário (2026-11-03)
- **Escritório único em 3D voxel (Three.js)** com câmera livre 360° (inclusive por baixo) + presets; personagens **andam** pelo escritório.
- **Todos** os containers aparecem, cada um com personagem e mesa **próprios** (nada genérico). Personagem = "o app se fosse gente" (AdGuard = herói musculoso de verde; Grafana = nerd do TI…).
- Comportamento: rodando com CPU baixa → atividades ociosas (café, janela, conversa, manias do perfil); com CPU → digita; busy → corre e digita rápido; stopped → dorme no sofá; error → pânico na mesa.
- Hover mostra detalhes completos do container. Acesso pela LAN (token no MVP).

### Ambiente verificado (máquina do usuário)
| Item | Valor |
|---|---|
| Docker Engine | 29.8.1, API 1.56, cgroup v2 (systemd), AppArmor + seccomp |
| Socket | `/var/run/docker.sock` `root:docker 660`; usuário está no grupo `docker` |
| Containers no momento da análise | 0 |
| Node / npm | v22.23.2 / 10.9.8 |

### Stack monitorada (referência)
Os composes reais ficam em `~/Projects/self-hosted-media-server/` (outro projeto — **não modificar**). Cada serviço está em pasta própria sem `name:` no compose, logo `com.docker.compose.project` = nome da pasta:

| Serviço MVP | Pasta | service / container_name | Imagem |
|---|---|---|---|
| Jellyfin | `jellyfin/` | `jellyfin` | `jellyfin/jellyfin` |
| Sonarr | `sonarr/` | `sonarr` | `lscr.io/linuxserver/sonarr` |
| Radarr | `radarr/` | `radarr` | `lscr.io/linuxserver/radarr` |
| AdGuard | `adguard/` | **`adguardhome`** | `adguard/adguardhome` |

Consequência: agrupar só por projeto compose gera 4 salas de 1 pessoa. O AdGuard já tem `homepage.group=Administração` (reaproveitável).

## 3. Regras para agentes

1. **Não invente assets nem animações.** Só use animações que existam nos arquivos/metadados. Sem animação de digitação → pose sentada + indicadores, expressões e balões.
2. **Não presuma dimensões comuns** entre spritesheets. Toda dimensão vem de `web/assets/manifest.json`; nada de números mágicos no código.
3. **Não adicione frameworks/dependências sem justificar** (finalidade, vantagens, desvantagens, impacto). Preferência: CSS manual + `@keyframes`, SVG, TS compilado com `tsc`.
4. **Interface somente leitura** com o Docker no MVP (sem start/stop/exec).
5. **Não modifique** `~/Projects/self-hosted-media-server` — só leia como referência.
6. Se faltar informação, declare a limitação em vez de supor.
7. Commit/push só quando o usuário pedir. Comunicação com o usuário em **português (BR)**.

## 4. Decisões de arquitetura

```
Docker Engine ──(socket | socket-proxy)──► Backend Node/TS
                                            ├─ DockerSource    list + events + stats
                                            ├─ StateStore      modelo canônico em memória
                                            ├─ StateClassifier working/busy/stopped/error
                                            ├─ Grouping        salas
                                            └─ WsGateway       snapshot + deltas
                                                   │ WebSocket
                                                   ▼
                          Frontend estático (HTML + CSS + SVG + TS)
                           ├─ WsClient     backoff, seq, resync
                           ├─ Store
                           ├─ OfficeLayout salas/mesas
                           └─ CharacterView sprites, overlays, balões
```

### Dependências aprovadas
| Pacote | Uso | Observação |
|---|---|---|
| `dockerode` | API Docker | previsto pelo usuário |
| `ws` | servidor WebSocket | Node 22 só tem cliente WS nativo |
| `typescript` (dev) | build | sem bundler; browser usa ES modules |
| `vitest` (dev, opcional) | testes de lógica pura | |
| `zod` (opcional, adiável) | validar config/mensagens | |

| `three` (0.187.0, exato) | cena 3D, OrbitControls, CSS2DRenderer | aprovado para câmera 360°; servido de `node_modules` via `/vendor/three/` + import map (sem bundler). ~420 KB gzip sem minificar → minificar no deploy |

HTTP estático via `node:http` (`scripts/serve.mjs`). **Sem** Express/React. Personagens e móveis são malhas voxel geradas (`web/src/three/voxel.ts`: caixas fundidas numa BufferGeometry por parte → poucos draw calls).

## 5. Protocolo WebSocket (v1)

Envelope: `{ v: 1, type, seq, ts, payload }` — `seq` monotônico por conexão.

| Dir. | type | payload |
|---|---|---|
| S→C | `hello` | versão, id do servidor, intervalo de métricas |
| S→C | `snapshot` | `engine`, `rooms[]`, `containers[]` |
| S→C | `container.upsert` | `ContainerView` completo |
| S→C | `container.remove` | `{ id }` |
| S→C | `metrics.batch` | `[{ id, cpu, memBytes, memPct }]` a cada 2–5 s |
| S→C | `engine.status` | `connected` \| `reconnecting` \| `down` + motivo |
| C→S | `resync` | pede snapshot (gap de `seq`, aba voltou a ficar visível) |
| ↔ | ping/pong | frames de controle do `ws`, ~20 s |

`ContainerView`:
```
id, name, image, project?, service?, roomId,
dockerState: created|running|paused|restarting|exited|dead,
health?: starting|healthy|unhealthy, exitCode?, oomKilled?,
restartCount, startedAt, finishedAt,
visualState: working|busy|stopped|error, reason (texto do balão),
characterProfile, metrics?: { cpu, memBytes, memLimit, memPct }
```

Regras: toda (re)conexão começa por `snapshot` (servidor não guarda histórico por cliente). Cliente reconecta com backoff exponencial + jitter (1 s → 30 s) e mostra overlay "offline" (luzes apagadas). Métricas sempre em lote/throttle.

## 6. Integração Docker

- **Descoberta:** `listContainers({ all: true })` + `inspect` sob demanda (health, exitCode, OOMKilled, RestartCount).
- **Eventos:** `getEvents({ filters: { type: ['container'] } })` — ações `create, start, die, stop, kill, restart, pause, unpause, destroy, oom, health_status:*`. Stream é **NDJSON fragmentado**: parsear por linha com buffer.
- **Queda do Engine:** marcar `reconnecting` → backoff → reabrir eventos com `since=<último ts>` → `listContainers` completo → reconciliar por diff.
- **Métricas:** `stats({ stream: true })` apenas para containers `running` (abrir no `start`, fechar no `die`), com limite de concorrência. Evitar `stream:false` (~1–2 s por chamada).
  - CPU% = `(Δcpu_total / Δsystem) × online_cpus × 100`; normalizar por núcleos ou por `NanoCpus` se houver limite.
  - Memória (cgroup v2) = `usage − stats.inactive_file`; % sobre `limit`.
- **Agrupamento (ordem de prioridade, configurável):**
  1. label `docker-office.room`
  2. mapeamento em `config/rooms.json`
  3. label `homepage.group`
  4. `com.docker.compose.project`
  5. sala "Recepção" (sem labels)
  - `com.docker.compose.oneoff=True` → ocultar ou mostrar como "visitante".
- **Segurança:** acesso ao socket = root no host; `:ro` não protege. Produção: `docker-socket-proxy` com `CONTAINERS=1 EVENTS=1 INFO=1 PING=1 VERSION=1 POST=0`, rede interna sem porta publicada. Backend em `127.0.0.1`/LAN, token opcional no handshake WS. Dev: socket direto via grupo `docker`.

## 7. Estados visuais

Avaliados em ordem de prioridade; limiares em `config/app.json`.

| Estado | Critério | Visual (sujeito aos assets) |
|---|---|---|
| `error` | `dead`; `exited` ≠ 0 sem stop/kill do usuário observado; `oomKilled`; `unhealthy`; `restarting` ou ≥ 3 restarts em 5 min | monitor vermelho, ⚠, balão com motivo (`OOM`, `exit 1`, `unhealthy`) |
| `stopped` | `exited` após evento `stop`/`kill`, `exitCode 0`, `created`, `paused` (variante "dormindo") | cadeira vazia ou personagem de pé, monitor desligado, `grayscale` |
| `busy` | `running` e CPU normalizada ≥ 70% por 3 amostras (sai só com < 50% por 3 — **histerese**) ou mem ≥ 90% do limite | animação mais rápida, gota de suor/"…", monitor piscando |
| `working` | `running` sem condições acima; `health=starting` → selo "iniciando" | sentado, idle, ● verde |

Ambiguidade: exit 137/143 pode ser stop ou kill externo. Sem evento correlacionado (ex.: backend reiniciou), tratar como `stopped`.

## 8. Sistema de personagens

- Declarativo em `web/config/characters.json`: `{ id, match, sprite, accessory, palette, bubbleTexts }`. **Nunca** uma classe por serviço.
- Resolução: label `docker-office.character` → regra por service/regex de imagem → **perfil genérico** com paleta determinística (hash do nome).
- Personagem voxel articulado (`web/src/characters/rig.ts`): partes, cabelos, chapéus, óculos, roupas e acessórios combinados por dados. Mesa própria (`office/furniture.ts`): estilo, cadeira/tapete na cor do serviço, objeto e decorações. Nome + balão em HTML (CSS2DRenderer); tela do monitor indica o estado.
- Comportamento em `web/src/sim/agent.ts` (decisão + animação); navegação A* em `sim/nav.ts`; layout automático em `office/layout.ts`.
- Acessórios sugeridos: Jellyfin pipoca/rolo de filme, Sonarr TV, Radarr claquete, AdGuard escudo — dependem dos assets.
- Posição de mesa estável: ordenar por nome e memorizar por `project/service` (não por id).

## 9. Estrutura de diretórios alvo

```
docker-office/
├─ package.json / tsconfig.base.json
├─ config/            app.json, characters.json, rooms.json
├─ shared/            protocol.ts, model.ts (tipos comuns)
├─ server/src/
│  ├─ docker/         client.ts, events.ts, stats.ts, reconnect.ts
│  ├─ domain/         store.ts, classifier.ts, grouping.ts   (lógica pura)
│  ├─ ws/             gateway.ts, broadcaster.ts
│  ├─ http/           static.ts
│  ├─ config/         loader + validação
│  └─ index.ts
├─ server/test/       classifier, grouping, parser NDJSON, fixtures
├─ web/
│  ├─ index.html
│  ├─ styles/         base, office, rooms, characters, animations
│  ├─ src/            net/, state/, sprites/, characters/, office/, ui/, main.ts
│  └─ assets/         characters/, furniture/, tiles/, icons/, manifest.json
├─ dev/mock-server/   cenários falsos no mesmo protocolo
└─ deploy/            Dockerfile, compose.yml (app + socket-proxy)
```

`web/assets/manifest.json` descreve cada sheet: frame w/h, linhas/colunas, animações por linha, fps, âncora, padding. Fonte única de verdade.

## 10. Roadmap

| # | Etapa | Concluída quando |
|---|---|---|
| 0 | **Assets**: receber pack, inventariar (formato, alfa, grade, frames, animações reais, fps/metadados, direções, camadas, escala/perspectiva), escrever `manifest.json` | todo sheet descrito e validado visualmente |
| 1 | Cena estática (HTML/CSS das salas e mesas, grid responsivo) | 2 salas + 4 mesas renderizadas, responsivo |
| 2 | Sistema de personagens + 4 estados visuais | página demo alterna estados só via dados |
| 3 | Protocolo + `dev/mock-server` + ws-client | UI atualiza sem reload; reconecta quando o mock cai |
| 4 | Docker: descoberta + eventos + grouping + classifier (sem busy) | start/stop/rm/restart refletem em < 1 s; sem-compose vai à Recepção |
| 5 | Métricas + `busy` com histerese | container sob `stress` vira busy e volta sem piscar |
| 6 | Resiliência (`since`, reconciliação, `engine.status`, testes) | `systemctl restart docker` → "reconectando" → consistente |
| 7 | Segurança e deploy (Dockerfile, socket-proxy, token) | roda containerizado sem socket direto |
| 8+ | Detalhes ao clicar, logs no balão (exige mais permissões), temas dia/noite, decoração por config, multi-host, histórico curto | — |

**Plano B** se os assets atrasarem: personagens placeholder em SVG (`<g>` para cabeça/corpo/acessório + `@keyframes`) atrás da mesma interface `CharacterView`, permitindo avançar etapas 1–3.

## 11. Riscos principais

| Risco | Mitigação |
|---|---|
| Assets ausentes/incompatíveis (escala, perspectiva, sem camadas) | manifest por sheet; plano B SVG; validar antes da etapa 2 |
| Sprite borrado / bleeding | `image-rendering: pixelated`, escala inteira (2×/3×), `steps(n)`, padding entre frames |
| Muitos personagens | animar só `transform`/`background-position`; `content-visibility`; pausar em aba oculta; LOD |
| Flood WebSocket | lote/throttle; deltas só em mudança real; `requestAnimationFrame` no cliente |
| Custo de stats | stream só dos `running`, concorrência limitada |
| Socket = root | socket-proxy read-only, sem porta pública, token |
| Inconsistência pós-queda | `since` + reconciliação; snapshot a cada reconexão; `seq` |
| Busy oscilando | histerese + janela de amostras |
| Responsividade | CSS Grid `auto-fit`; escala de sprite por breakpoint; modo lista em telas pequenas |

## 12. Pendências com o usuário (bloqueiam/guiam a próxima etapa)

1. **Fornecer os assets** em `assets/` (com JSON de metadados, se houver). Sem isso, inventário e análise de spritesheets ficam pendentes.
2. **Escolher a estratégia de salas**, já que cada serviço é um projeto compose separado: mapeamento manual (`config/rooms.json`), `homepage.group`, ou label `docker-office.room` nos composes.

## 13. Próxima ação recomendada

Se os assets já existirem: executar a **Etapa 0** (inventário + `manifest.json`) e reportar ao usuário antes de codar.
Se não: perguntar ao usuário se deve seguir com o **plano B (SVG)** para as etapas 1–3.
