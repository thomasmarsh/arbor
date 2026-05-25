#!/bin/bash
set -e

if ! command -v mkcert &> /dev/null; then
  echo "mkcert not found. Install with: brew install mkcert"
  exit 1
fi

mkcert -install
mkdir -p certs
mkcert -cert-file certs/localhost+2.pem -key-file certs/localhost+2-key.pem localhost 127.0.0.1 ::1
echo "✓ Certs generated in certs/"
