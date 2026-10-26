#!/usr/bin/env bash
# Primeira instalação. Rode no servidor, dentro desta pasta:  bash instalar.sh
set -euo pipefail
cd "$(dirname "$0")"

DOMINIO="${1:-wa.goulartefilho.app}"

if [ ! -f .env ]; then
  CHAVE=$(openssl rand -hex 24)
  SENHA_BANCO=$(openssl rand -hex 24)
  cat > .env <<ENV
DOMINIO=$DOMINIO
POSTGRES_PASSWORD=$SENHA_BANCO

SERVER_TYPE=http
SERVER_PORT=8080
SERVER_URL=https://$DOMINIO
LANGUAGE=pt-BR
TELEMETRY_ENABLED=false
LOG_LEVEL=ERROR,WARN,INFO
DEL_INSTANCE=false

# Chave mestra da API: vai também para a Vercel (EVOLUTION_API_KEY)
AUTHENTICATION_API_KEY=$CHAVE
AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=false

DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=postgresql://evolution:$SENHA_BANCO@postgres:5432/evolution?schema=evolution_api
DATABASE_CONNECTION_CLIENT_NAME=goularte
DATABASE_SAVE_DATA_INSTANCE=true
DATABASE_SAVE_DATA_NEW_MESSAGE=true
DATABASE_SAVE_MESSAGE_UPDATE=true
DATABASE_SAVE_DATA_CONTACTS=true
DATABASE_SAVE_DATA_CHATS=true
DATABASE_SAVE_DATA_LABELS=false
DATABASE_SAVE_DATA_HISTORIC=true

CACHE_REDIS_ENABLED=true
CACHE_REDIS_URI=redis://redis:6379/6
CACHE_REDIS_PREFIX_KEY=evolution
CACHE_REDIS_SAVE_INSTANCES=false
CACHE_LOCAL_ENABLED=false

# Nome que aparece em "Aparelhos conectados" no celular
CONFIG_SESSION_PHONE_CLIENT=Goularte Filho CRM
CONFIG_SESSION_PHONE_NAME=Chrome
QRCODE_LIMIT=30

CORS_ORIGIN=*
CORS_METHODS=GET,POST,PUT,DELETE
CORS_CREDENTIALS=true

# O webhook para o CRM é ligado na próxima etapa
WEBHOOK_GLOBAL_ENABLED=false
ENV
  chmod 600 .env
  echo "Arquivo .env criado com senhas novas."
else
  echo "Já existe um .env; mantive as senhas atuais."
fi

docker compose pull
docker compose up -d
echo
echo "Pronto. Em 1 a 2 minutos abra:  https://$DOMINIO/manager"
echo "Para ver a chave da API:        grep AUTHENTICATION_API_KEY .env"
