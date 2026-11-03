# Stack de teste (somente local)

Sobe os **32 serviços reais** de `~/Projects/self-hosted-media-server` para ver o Docker Office ao vivo,
**sem editar nada lá**: cada pasta recebe o override `ov-<pasta>.yml` daqui.

```sh
cp dev/stack-test/test.env.example dev/stack-test/test.env   # ajuste caminhos e gere as senhas
dev/stack-test/stack.sh up      # sobe tudo (cria a rede media_network se faltar)
dev/stack-test/stack.sh ps      # status
dev/stack-test/stack.sh down    # derruba tudo
```

O que os overrides mudam (só para teste):

- `restart: "no"` em tudo — nada volta sozinho depois de um reboot.
- Todos na rede `media_network` (menos o ntopng, cujo `redis` colidiria com o do Immich). Uma rede por pasta
  esgotava os pools de IP do Docker (`all predefined address pools have been fully subnetted`).
- Portas novas publicadas **só em `127.0.0.1`** (Juice Shop é propositalmente vulnerável; File Browser, n8n,
  qBittorrent e Forgejo nascem sem senha configurada). AdGuard usa 1053 (53 é do systemd-resolved).
- `test.env` (fora do git) define `DATA_DIR`/`MEDIA_DIR` em `self-hosted-media-server/data/` (ignorado pelo git
  de lá) e as variáveis que os `.env` de Immich, Kopia e Speedtest Tracker teriam.
- Kopia não monta a sua home nem `/mnt/backup`; Scrutiny só recebe `/dev/sda`; MAT2 usa a imagem oficial
  em vez do build; Homepage guarda a config em `DATA_DIR`; Speedtest Tracker sem testes agendados.

Se um container sair com *permission denied* na primeira subida, a pasta em `data/` foi criada como root pelo
Docker. Ajuste o dono só daquela pasta, por exemplo Prometheus (`65534`) e Grafana (`472`):

```sh
docker run --rm -v ~/Projects/self-hosted-media-server/data:/d alpine \
  chown -R 65534:65534 /d/monitoring/prometheus-data
```
