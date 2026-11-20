#!/bin/zsh
# Klik dua kali di Finder untuk menjalankan TOCOK'S (backend 8120 + frontend 3021).
source ~/.zprofile 2>/dev/null
source ~/.zshrc 2>/dev/null
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd "$(dirname "$0")"
echo "Node: $(node -v 2>/dev/null || echo 'tidak ditemukan')"
if ./start-local.sh; then
  sleep 2 && open "http://localhost:3021"
  echo "Jendela ini boleh ditutup; server tetap berjalan."
else
  echo "Gagal menjalankan TOCOK'S. Lihat pesan di atas."
fi
