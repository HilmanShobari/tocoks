# TOCOK'S

Vite + React storefront untuk **TOCOK'S — Premium Homemade Cookies**: web scroll sinematik dengan nastar raksasa yang terbelah, lalu berganti menjadi Choco Coconut Cheese, Palm Sugar Cheese, dan Sago Matcha. Diakhiri konfigurator **Paket Hampers** (3 toples, Rp290.000) dan checkout Xendit.

Desain, keputusan, dan aset ada di [`PRD.md`](PRD.md) dan [`design/`](design/).

## Port

| Layanan | Port |
| --- | --- |
| Frontend (Vite) | 3021 |
| Backend checkout (`backend/`) | 8120 |

## Menjalankan

```bash
npm install
npm --prefix backend install
# Sekali saja: salin env lalu isi (lihat bagian Env)
cp .env.example .env            # bila belum ada
cp backend/.env.example backend/.env
npm --prefix backend start      # terminal 1
npm run dev                     # terminal 2 → http://localhost:3021
```

Atau sekaligus: `./start-local.sh` (macOS/Linux) atau `./start-local.ps1` (Windows, sama seperti brand dummy lain).

`npm run build` memeriksa frontend dan sintaks backend. `npm run backend:test` menjalankan tes checkout, isolasi brand, atribusi Afihub, dan Paket Hampers (fixture, bukan transaksi sandbox riil).

## Deploy

Frontend statis bisa langsung ke Vercel. `vercel.json` sudah mengatur build (`vite build`), output `dist`, dan rewrite SPA untuk `/checkout` + `/checkout/result`; `.vercelignore` mengabaikan `design/` dan `backend/`.

1. Import repo di Vercel (framework Vite).
2. Set env build: `VITE_CHECKOUT_API_URL=https://<backend-publik>/api/v1` dan `VITE_AFIHUB_MERCHANT_ID=<merchant-id>`.
3. Deploy.

Catatan:

- `public/` berukuran ~117 MB. Vercel Hobby membatasi upload CLI 100 MB; untuk Hobby pakai frame 1600/2560, deploy lewat integrasi Git, atau gunakan Vercel Pro/Cloudflare Pages.
- Backend checkout **tidak bisa** dijalankan di Vercel apa adanya: memakai SQLite, worker `setInterval` 15 detik, dan listen loopback. Jalankan di Railway/Render/Fly dengan persistent disk, set `STOREFRONT_STORE_URL=https://<domain-vercel>` agar CORS mengizinkan, dan longgarkan guard `STOREFRONT_HOST` di `backend/server.mjs` untuk `0.0.0.0`.
- Kalau hanya frontend yang dideploy, halaman toko bisa dilihat publik tetapi submit checkout akan gagal karena tidak ada API.

## Env

Pola sama dengan `lari-studio`.

- **Frontend `.env`**: `VITE_AFIHUB_MERCHANT_ID` = Merchant ID publik TOCOK'S dari Brand Portal Afihub. Jangan taruh secret di variabel `VITE_*`.
- **Backend `backend/.env`**:
  - `STOREFRONT_XENDIT_API_KEY`: secret key **TEST** Xendit (`xnd_development_...`). Key live ditolak.
  - `STOREFRONT_XENDIT_CALLBACK_TOKEN`: opsional; status invoice juga dipolling.
  - `STOREFRONT_ADMIN_TOKEN`: token server untuk update status selesai/refund. Berbeda dengan brand lain.
  - `AFIHUB_MERCHANT_ID`, `AFIHUB_WEBHOOK_SECRET`, `AFIHUB_CONVERSION_URL`: dari Brand Portal → Website Custom → SDK. Merchant ID harus sama dengan frontend.
  - `STOREFRONT_STORE_URL=http://localhost:3021`.

Tanpa tiga nilai `AFIHUB_*`, checkout TEST tetap jalan, tapi konversi ditahan di outbox sampai merchant dikonfigurasi lalu backend di-restart.

## Checkout & Paket Hampers

Frontend mengirim keranjang ke `POST /api/v1/storefront/checkout`. Server menghitung ulang harga dari `src/brand.js`:

- Toples satuan: `{ product_id: 'nastar-klasik', quantity }` → Rp90.000/toples.
- Paket Hampers: `{ product_id: 'paket-hampers', quantity, jars: [3 id toples] }` → Rp290.000/paket. Isi wajib tepat 3 toples dari katalog (boleh varian sama). Nama item di invoice dan Afihub memuat isinya, mis. `Paket Hampers (Nastar Klasik ×2, Sago Matcha)`.
- Ongkir Rp15.000 untuk subtotal < Rp300.000, selain itu gratis.

Setelah Xendit memverifikasi pembayaran, worker outbox mengirim `order.paid` ke Afihub lewat `@afihub/node` (subtotal tanpa ongkir, SKU `paket-hampers` / id toples). Detail retry, refund, callback: [`backend/README.md`](backend/README.md).

## Integrasi Afihub

Sama seperti Lari: `src/main.jsx` memanggil `src/afihub/bootstrap.js` (capture `afihub_click_id` 7 hari + enrich checkout), backend memakai `backend/afihub/client.mjs`. SDK dari `vendor/*.tgz`. Pemeriksaan lokal:

```bash
npx --no-install afihub doctor
```

Uji penuh tetap perlu: daftarkan TOCOK'S di Brand Portal (produk dengan SKU `nastar-klasik`, `choco-coconut-cheese`, `palm-sugar-cheese`, `sago-matcha`, `paket-hampers`), buat program aktif, klik link kreator → checkout → bayar invoice TEST → cek Konversi.

## Animasi scroll

Video Google Flow 1080p ada di `design/public/video/`. Versi 4K hasil `fx-upscale` disimpan di `design/public/video/upscaled/` (HEVC, audio ikut terbawa). Website memakai frame WebP hasil ekstraksi di `public/frames/<klip>/{d,m}/` (desktop 3840 px full 4K, mobile 900 px, 14 fps) yang di-*scrub* di `<canvas>` (`src/Stage.jsx`, panjang tiap bagian di `src/sequence.js`). Pengguna dengan *reduced motion* mendapat perpindahan gambar diam.

Membuat ulang versi 4K (sekali per klip, gratis, native Apple Silicon):

```bash
brew tap finnvoor/tools
brew install fx-upscale

fx-upscale design/public/video/Nastar_cookie_breaking_in_half_4ecaeea2_1080p.mp4 \
  -w 3840 -h 2160 -c hevc
mkdir -p design/public/video/upscaled
mv "design/public/video/Nastar_cookie_breaking_in_half_4ecaeea2_1080p Upscaled.mp4" \
  design/public/video/upscaled/01-intro-4k.mp4
```

Membuat ulang frame desktop (contoh klip pembuka; butuh `cwebp` dari `brew install webp`):

```bash
ffmpeg -ss 0.5 -to 7.0 -i design/public/video/upscaled/01-intro-4k.mp4 \
  -vf "fps=14,scale=3840:-2:flags=lanczos" /tmp/01-intro-%03d.png
for f in /tmp/01-intro-*.png; do
  cwebp -q 85 "$f" -o "public/frames/01-intro/d/$(basename "$f" .png).webp"
done
```

Trim dan jumlah frame yang harus cocok dengan `src/sequence.js`: intro 0.5–7.0 s (91), nastar→choco 0.75–6.5 s (81), choco→palm 0.5–7.25 s (95), palm→matcha 0.5–7.0 s (91). Frame mobile (`m/`) tetap 900 px; hanya desktop yang dibuat full 4K. Set desktop 3840 q85 totalnya sekitar 100 MB.
