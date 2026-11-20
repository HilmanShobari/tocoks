# Backend checkout tocoks

Backend ini dimiliki **tocoks**, berada di repo brand, dan berjalan mandiri di port **8120**. Ia hanya memuat katalog `../src/brand.js` milik brand ini. Tidak mengimpor source, membaca `.env`, atau memakai database dari Afihub maupun backend brand lain.

Website :3021 → backend brand :8120 → Xendit TEST. Setelah pembayaran diverifikasi server, backend mengirim webhook bertanda tangan ke Afihub :8080 untuk atribusi/komisi. Afihub tidak membuat invoice checkout toko.

## Menjalankan sendiri

Node >=22.13. SDK @afihub/node dipasang dari tarball vendor: jalankan `npm --prefix backend install`. Dari root repo brand:

```powershell
# Jika backend/.env belum ada: Copy-Item backend/.env.example backend/.env
# Isi STOREFRONT_XENDIT_API_KEY di backend/.env dengan key TEST.
npm --prefix backend run setup:local
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend start
```

Terminal frontend terpisah: `npm run dev`. Alternatif launcher dari root repo brand: `./start-local.ps1`. Launcher me-restart backend dan frontend brand yang sudah berjalan, atau menyalakan layanan jika port kosong. Dari parent dummy-brand, `./start-all.ps1` berlaku untuk semua sepuluh brand. Gunakan `-WhatIf` untuk pratinjau, `-NoRestart` untuk mempertahankan proses aktif, `-SkipFrontend` untuk backend saja, atau `-SkipBackend` untuk frontend saja. Pemilik port harus cocok dengan brand; layanan lain tidak dihentikan.

Konfigurasi hanya `backend/.env` atau environment proses (environment proses diutamakan). Path DB/config relatif folder backend. Default DB `data/orders.sqlite`,  log `logs/`; semuanya diabaikan Git. Key production ditolak. Key pembayaran tidak dikirim ke browser. `STOREFRONT_ADMIN_TOKEN` wajib untuk perubahan status server; berbeda setiap brand. Kredensial test Xendit yang sama boleh dipakai untuk simulasi, tetapi setiap backend mempunyai konfigurasi sendiri.

Frontend mem-proxy `/api` ke port 8120; `.env.example` frontend menyediakan `VITE_CHECKOUT_PROXY_TARGET`. Deployment: reverse proxy `/api` ke backend brand sendiri, atau `VITE_CHECKOUT_API_URL=https://checkout.brand.example/api/v1`.

## Merchant Afihub

`npm --prefix backend run setup:local` hanya memeriksa tiga konfigurasi SDK dari backend/.env. Tidak membaca database Afihub atau file JSON merchant, tidak membuat akun, dan tidak menulis secret. Ambil Merchant ID/secret/endpoint dari Brand Portal. SKU produk website harus cocok dengan katalog Afihub. Mengganti merchant ID menahan order lama agar tidak dikirim ke brand lain.

Daftarkan brand, buat program aktif, isi dana komisi, daftarkan produk dan setujui kreator agar klik dapat menghasilkan komisi. Tanpa Merchant ID/secret, checkout TEST tetap berjalan tetapi konversi ditahan dalam outbox.

`GET /health` hanya menampilkan status dasar service dan tidak membuka konfigurasi atau jumlah event outbox.

## Peralihan dari layanan lama

Snapshot pesanan lama disalin ke database brand yang sesuai tanpa mengubah order ID, token hash, invoice atau outbox. Database/proses lama tidak dihentikan atau dihapus otomatis. **Hentikan layanan bersama port 8090 secara manual sebelum memulai backend baru** agar tidak ada dua worker untuk pesanan yang sama. Jangan melakukan checkout/pembayaran ke backend lama setelah snapshot; jika ada perubahan, lakukan salinan ulang sebelum beralih.

SQLite dipakai untuk simulasi satu instance per brand. Pindahkan folder repo beserta backend/.env, secrets dan database secara aman bila deploy. Runtime backend tidak bergantung pada struktur folder Afihub.

## Akun Xendit bersama

Sepuluh dummy brand memakai satu akun Xendit test, bukan settlement ke sepuluh rekening brand berbeda. Untuk bisnis sesungguhnya, backend dan akun pembayaran dimiliki brand; protokol Afihub tetap sama.

Worker membaca status invoice langsung ke Xendit setiap interval. Halaman hasil juga meminta backend memeriksa status. Alur lokal ini **tidak perlu mengganti callback dashboard yang dipakai top-up Afihub**. Redirect sukses/parameter URL bukan bukti pembayaran.

Callback opsional: `POST /api/v1/webhooks/xendit/invoice` pada backend brand port 8120. Isi `STOREFRONT_XENDIT_CALLBACK_TOKEN` dari verification token dashboard. Header `x-callback-token`, invoice ID, external ID, currency, amount, paid amount diverifikasi; token kosong/salah ditolak. Callback non-storefront dengan token valid diabaikan. Jangan mengganti callback akun bersama tanpa dispatcher top-up/storefront; polling sudah mencukupi untuk pengujian lokal.

Hosted callback dan webhook brand membutuhkan URL HTTPS publik. `localhost` hanya bekerja di mesin/jaringan yang sesuai. Setel `VITE_PUBLIC_INGEST_URL` di Brand Portal untuk menghasilkan panduan dengan alamat publik Afihub yang benar. Jangan membuka endpoint atau mengubah dashboard callback secara otomatis.

## Paket Hampers

Item `{ product_id: 'paket-hampers', quantity, jars: [...] }` wajib berisi tepat 3 id toples dari `src/brand.js` (boleh sama). Harga paket Rp290.000 diambil dari katalog server. Isi diurutkan dan dipakai sebagai kunci baris, jadi dua hampers dengan isi berbeda menjadi dua baris; isi yang sama harus digabung lewat `quantity`. Ke Afihub hanya dikirim field item standar (tanpa `jars`), dengan SKU `paket-hampers`.

## API checkout, persistensi dan retry

- `POST /api/v1/storefront/checkout`: brand_slug, items (product_id/quantity), customer, return_url, session_token, checkout_key, order_token. Harga/ongkir dihitung dari katalog server. Ongkir 15.000 untuk subtotal <300.000; selain itu gratis.
- Request bersamaan/retry memakai checkout_key dan order token sama. Pergantian keranjang/customer/atribusi memakai key baru. Sebelum membuat ulang invoice setelah timeout, server mencari external_id yang sama di Xendit.
- `GET /api/v1/storefront/orders/{id}?brand_slug=...` wajib `Authorization: Bearer ORDER_TOKEN`. Respons tidak memuat customer, secret, atau ID klik. Token dibawa URL kembali provider, disimpan ke sessionStorage, lalu dihapus dari URL browser; storefront memakai referrer policy no-referrer.
- Order dan outbox disimpan di `backend/data/orders.sqlite` (WAL). Paid dan event disimpan atomik. Setelah restart, pembayaran pending direkonsiliasi dan event belum terkirim di-retry dengan backoff maksimum 5 menit.
- Event paid harus terkirim sebelum completed/refund pada order yang sama. Timestamp/signature dibuat ulang saat retry. Event idempotent memakai merchant+order_id yang stabil, sehingga tidak membuat komisi ganda.
- Komisi memakai subtotal produk tanpa ongkir, integer rupiah, serta item produk yang sesuai. Email di-hash untuk pemeriksaan self-referral. Nama/alamat pembeli tidak dikirim ke Afihub.

Database ini untuk satu instance simulasi. Multi-instance memerlukan database bersama, leasing outbox, kebijakan retensi PII, backup, autentikasi operator, dan pemisahan akun pembayaran.

## Webhook custom Afihub

Endpoint `POST /api/v1/webhooks/custom` wajib HMAC-SHA256 hex dari **raw JSON body**, header `X-AfiHub-Signature: sha256=...` dan `X-AfiHub-Timestamp` unix detik. Field string `timestamp` dalam body harus sama dengan header agar timestamp ikut ditandatangani. Umur maksimal 5 menit, toleransi clock ke depan 1 menit. Event platform tidak diterima endpoint custom.

Pasangan event/status: `order.paid`/`paid`, `order.fulfilled`/`fulfilled`, `order.completed`/`completed`, `order.refunded`/`refunded`, `order.cancelled`/`cancelled`. IDR dan amount integer positif wajib. Tanpa klik valid transaksi menjadi organik. Respons sukses berarti diterima, bukan jaminan komisi: cek status konversi/fraud, program dan saldo.

Panduan Website Custom pada Brand Portal berisi kredensial, kode capture klik, contoh Node.js server untuk HMAC dan payload, tabel status, serta langkah pengujian.

## Update selesai dan refund

Layanan tidak melakukan refund uang Xendit. Setelah backend/operator brand mengonfirmasi pesanan selesai/refund pada payment gateway, laporkan status melalui endpoint server-only. Isi `STOREFRONT_ADMIN_TOKEN` lalu:

```http
POST /api/v1/storefront/orders/ORDER_UUID/status
Authorization: Bearer SERVER_ADMIN_TOKEN
Content-Type: application/json

{"brand_slug":"nara-atelier","status":"completed"}
```

Status: fulfilled, completed, refunded, cancelled untuk order yang sudah dibayar. Update sama idempotent. Token admin tidak boleh berada di frontend. Refund diterima Afihub sebagai delivery sukses meskipun konversi menjadi rejected dan komisi voided.

## Pengujian

`npm test` mencakup harga server, isolasi brand/token, concurrency, duplikat/palsu callback, status provider, key live, persistensi, outage retry, konfigurasi merchant kosong, urutan paid/fulfilled/completed/refund, HTTP, katalog brand ini dan penolakan request/config brand lain. Xendit/Afihub memakai fixture di tes ini; bukan transaksi sandbox riil.

Uji sandbox penuh: link kreator disetujui → checkout → bayar invoice TEST → paid terverifikasi → worker → log Brand Portal/Konversi/komisi kreator. Uji update/refund secara terpisah. Jangan menyebut fixture sebagai bukti pembayaran sandbox yang sudah selesai.

Referensi: [Invoice API Xendit](https://github.com/xendit/xendit-node/blob/master/docs/Invoice.md), [autentikasi webhook](https://docs.xendit.co/docs/handling-webhooks/).

## SDK Afihub

Gunakan tiga AFIHUB_* environment backend dari Brand Portal. Konfigurasi JSON merchant lama tidak dibaca.

## Installer Afihub (website custom)

Integrasi TOCOK'S sekarang memakai hasil `afihub init`. Tracking bootstrap dipasang pada `src/main.jsx`, helper berada di `src/afihub/`, dan helper backend di `backend/afihub/client.mjs`. Hook checkout/outbox TOCOK'S menyimpan ID klik pada order dan mengirimnya hanya setelah gateway terverifikasi. Payment gateway, database order, dan antrean tetap milik TOCOK'S.

Dari root TOCOK'S:

```powershell
npx --no-install afihub doctor
npx --no-install afihub init --yes --backend backend --checkout-path /api/v1/storefront/checkout
npm run build
```

Init dapat diulang; file generated yang Anda modifikasi tidak ditimpa. `.afihub/backups/` dapat berisi salinan env lama dan diabaikan Git. Doctor memeriksa pemasangan lokal, bukan bukti komisi; uji transaksi sandbox tetap diperlukan. Tidak ada layanan yang dijalankan/dihentikan installer. Restart sendiri setelah env berubah.
