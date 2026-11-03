# Stack de teste (somente local)

Sobe os serviços reais de `~/Projects/self-hosted-media-server` **sem editar os composes**:

- `test.env` (copie de `test.env.example`; fica fora do git) aponta `DATA_DIR`/`MEDIA_DIR` para `self-hosted-media-server/data/` (já ignorado pelo git de lá).
- `ov-<serviço>.yml` desliga o restart automático; AdGuard usa a porta 1053 (53 está ocupada pelo systemd-resolved).

```sh
R=~/Projects/self-hosted-media-server; T=$PWD/dev/stack-test
(cd $R/jellyfin && docker compose --env-file $T/test.env -f docker-compose.yml -f $T/ov-jellyfin.yml up -d)
# idem sonarr, radarr, adguard (ov-adguard.yml)
# derrubar: trocar `up -d` por `down`
```
