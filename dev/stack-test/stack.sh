#!/usr/bin/env bash
# Sobe/derruba os 32 serviços reais de self-hosted-media-server para testar o Docker Office.
# Não edita nada lá: cada pasta recebe o override ov-<pasta>.yml daqui.
#   ./stack.sh up | down | ps        (STACK=~/outro/caminho ./stack.sh up)
set -euo pipefail
T="$(cd "$(dirname "$0")" && pwd)"
R="${STACK:-$HOME/Projects/self-hosted-media-server}"
ENV="$T/test.env"
[ -f "$ENV" ] || { echo "crie $ENV a partir de test.env.example" >&2; exit 1; }
cmd="${1:-up}"
# monitoring e jellyseerr usam a rede externa media_network
[ "$cmd" = up ] && { docker network inspect media_network >/dev/null 2>&1 || docker network create media_network >/dev/null; }
for ov in "$T"/ov-*.yml; do
  dir="$(basename "$ov" .yml)"; dir="${dir#ov-}"
  [ -d "$R/$dir" ] || { echo "pulando $dir (pasta não existe)"; continue; }
  case "$cmd" in
    up)   args=(up -d --quiet-pull) ;;
    down) args=(down) ;;
    ps)   args=(ps --format '{{.Name}}\t{{.Status}}') ;;
    *)    echo "uso: $0 up|down|ps" >&2; exit 2 ;;
  esac
  echo "▸ $dir"
  (cd "$R/$dir" && docker compose --env-file "$ENV" -f docker-compose.yml -f "$ov" "${args[@]}") || echo "  ✗ falhou: $dir"
done
