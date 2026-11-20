#!/usr/bin/env bash
# Menjalankan backend (8120) dan frontend (3021) TOCOK'S di macOS/Linux. Log di backend/logs/.
# Untuk Windows gunakan ./start-local.ps1 (sama seperti brand dummy lain).
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules ] || { echo "Jalankan npm install dulu."; exit 1; }
[ -d backend/node_modules ] || { echo "Jalankan npm --prefix backend install dulu."; exit 1; }
mkdir -p backend/logs
stamp=$(date +%Y%m%d-%H%M%S)
for port in 8120 3021; do
  if lsof -nP -iTCP:$port -sTCP:LISTEN >/dev/null 2>&1; then echo "Port $port sudah dipakai; hentikan prosesnya dulu."; exit 1; fi
done
(cd backend && nohup node server.mjs > "logs/backend-$stamp.out.log" 2> "logs/backend-$stamp.err.log" &)
for i in $(seq 1 40); do
  curl -fsS http://127.0.0.1:8120/health 2>/dev/null | grep -q '"brand":"tocoks"' && break
  sleep 0.25
done
curl -fsS http://127.0.0.1:8120/health >/dev/null || { echo "Backend belum sehat; cek backend/logs/backend-$stamp.err.log"; exit 1; }
nohup env VITE_CHECKOUT_PROXY_TARGET=http://localhost:8120 node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3021 --strictPort \
  > "backend/logs/frontend-$stamp.out.log" 2> "backend/logs/frontend-$stamp.err.log" &
echo "tocoks: backend http://localhost:8120, frontend http://localhost:3021"
