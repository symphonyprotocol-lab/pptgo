#!/bin/sh
# Fills the blank secrets in `.env` — AUTH_SECRET, POSTGRES_PASSWORD and
# S3_SECRET_ACCESS_KEY — and leaves any value that is already set alone, so it is safe to
# re-run. Creates `.env` from `.env.example` first if it does not exist.
#
# POSTGRES_PASSWORD goes into a connection URL, so it is hex rather than base64: `/`, `@`
# and `+` in a password silently truncate the DSN and produce an authentication failure
# that looks nothing like its cause.
set -eu

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
  echo "created .env from .env.example"
fi

fill() {
  name=$1
  value=$2
  if ! grep -q "^${name}=$" .env; then
    echo "  ${name} already set, leaving it"
    return
  fi
  # a temp file rather than `sed -i`, whose in-place flag differs between BSD and GNU
  awk -v name="$name" -v value="$value" \
    '$0 == name "=" { print name "=" value; next } { print }' .env > .env.tmp
  mv .env.tmp .env
  echo "  ${name} generated"
}

fill AUTH_SECRET "$(openssl rand -base64 32)"
fill POSTGRES_PASSWORD "$(openssl rand -hex 24)"
fill S3_SECRET_ACCESS_KEY "$(openssl rand -hex 24)"

echo
echo "done — .env is ready for 'docker compose up -d'"
echo "sign-in also needs AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET; without them the stack"
echo "still runs, with the landing page and the browser-local editor at /editor."
