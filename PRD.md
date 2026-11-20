# PRD — TOCOK'S: Web Interaktif 3D Kue Kering

| | |
| --- | --- |
| Brand | **TOCOK'S**: *Premium Homemade Cookies* · *Delicious & Finest Quality* |
| Kategori | Kue kering premium dalam toples 350 g, dibuat dengan butter Wisman, dijual sepanjang tahun |
| Produk | Nastar Klasik, Choco Coconut Cheese, Palm Sugar Cheese, Sago Matcha + Paket Hampers |
| Kontak (dari price list) | WhatsApp 0895-3968-50847 |
| Folder | `afihub-dummy-brand/tocoks` |
| Port lokal (usulan) | Frontend 3021, backend 8120 (lanjut dari pasar-loka 3019/8119) |
| Status | v0.5: web sudah dibangun (frontend 3021, backend 8120) |
| Referensi animasi | YouTube `Qr3OMACe_6Y` menit 4:45–5:35 (situs gelato "NUVOLA") |

---

## 1. Ringkasan

TOCOK'S adalah toko online kue kering premium buatan rumahan dengan pengalaman scroll sinematik. Website ini dibuka kapan saja sepanjang tahun, jadi **tidak memakai nuansa musiman**: tanpa ketupat, masjid, lentera, bedug, bulan-bintang, ornamen mandala, atau kata "Lebaran"/"Eid". Kue diposisikan sebagai camilan harian, suguhan tamu, oleh-oleh, dan hadiah.

Objek utamanya adalah **satu kue nastar raksasa** yang difoto makro dan menggugah selera: kulit butter keemasan yang retak halus, olesan kuning telur yang mengilap, cengkih di puncaknya, dan selai nanas yang mengintip dari retakan. Saat pengunjung scroll, nastar terbelah dan selai nanasnya mulur. Setelah itu, setiap varian mendapat satu layar penuh: kue raksasa di tengah berganti (Nastar Klasik → Choco Coconut Cheese → Palm Sugar Cheese → Sago Matcha), bahan khasnya muncul secukupnya, dan teks produk tampil di kiri.

Tujuannya agar pengunjung merasa lapar dan terkesan dalam 3 detik pertama, lalu bisa memilih varian, menyusun Paket Hampers, dan checkout tanpa keluar dari pengalaman tersebut.

## 2. Analisis referensi (video 4:45–5:35)

| Elemen di referensi | Cara kerjanya | Adaptasi TOCOK'S |
| --- | --- | --- |
| **Hero wordmark raksasa** "NUVOLA" di belakang cone; cone menutupi satu huruf | Teks HTML besar, objek foto/video di layer atasnya | Wordmark **TOCOK'S** krem raksasa, **nastar raksasa** menggantikan huruf "O" |
| Latar gelap ungu-maroon dengan vignette lembut | Gradient radial | Cokelat kakao gelap dengan sorotan karamel hangat dari atas |
| Tagline serif italic kecil di kiri bawah + label "SCROLL" | Tipografi | *"Semua rasa favorit, dalam satu gigitan."* + "SCROLL" |
| **Ledakan semua rasa** saat mulai scroll | Video/frame sequence yang di-*scrub* oleh posisi scroll | Nastar terbelah, selai nanas mulur, remah dan tetes selai melayang. Dibuat secukupnya, tidak heboh |
| **Section per rasa**: objek tetap di kanan, bahan rasa di belakang; kiri berisi label, judul besar, tagline italic, komposisi, stok, tombol | Sticky section + scrub per rasa; warna aksen berganti | "01 / 04": judul, tagline, komposisi, "Dipanggang hari ini", harga, tombol **"Masukkan ke hampers"** |
| **Transisi antar rasa**: percikan rasa berikutnya menimpa yang lama | Frame sequence transisi A→B | Kue raksasa berubah menjadi varian berikutnya bersama bahan khasnya |
| **Pill navigasi rasa** di atas | Scroll-spy | Nastar · Choco Coconut · Palm Sugar · Sago Matcha |
| Badge "My cup: 0 of 3" + "Sound: off" | State keranjang + toggle audio | "Hampers: 0 dari 3" + toggle suara (default off) |
| **Kursor meninggalkan jejak sprinkles** | Partikel canvas mengikuti pointer | Jejak remah kue halus |
| Section "Build your cup" | Konfigurator sederhana | **"Susun Paket Hampers-mu"**: pilih 3 toples, isi box terlihat, harga paket |
| Kartu **Opening hours** + **Find us** | Kartu info dinamis | Jam dapur, batas kirim hari ini, pesan via WhatsApp |

Teknik yang kemungkinan dipakai referensi: aset gambar/video yang di-generate AI (objek + bahan di latar gelap yang konsisten), lalu frame video di-*scrub* dengan scroll di atas `<canvas>`. Kita pakai pendekatan yang sama.

## 3. Tujuan & metrik

| Tujuan | Metrik |
| --- | --- |
| Pengalaman memorable dan menggugah selera | Scroll depth ≥ 70% sampai section hampers |
| Konversi | Klik "Masukkan ke hampers"/"Beli satuan" ≥ 15% sesi; checkout ≥ 3% sesi |
| Performa | LCP < 2,5 dtk di 4G; hero tampil < 1,5 dtk; 60 fps di desktop, ≥ 45 fps di HP menengah |
| Integrasi brand dummy Afihub | Checkout dan atribusi berjalan seperti brand lain |

## 4. Pengguna

- **Pencinta camilan** (20–45 th) yang membeli kue kering untuk diri sendiri atau keluarga, kebanyakan dari HP.
- **Tuan rumah**: butuh suguhan untuk tamu, arisan, atau acara kantor.
- **Pemberi hadiah**: butuh Paket Hampers yang rapi untuk ulang tahun, oleh-oleh, atau ucapan terima kasih.

## 5. Struktur halaman & alur scroll

1. **Hero** (layar 1): wordmark TOCOK'S, nastar raksasa menggantikan huruf "O", tagline, label SCROLL, pill varian, badge hampers.
2. **Pembuka** (± 1,5 layar scroll): nastar terbelah, selai nanas mulur. Di-*scrub* oleh scroll (maju/mundur mengikuti jari). **Video sudah jadi**: "Nastar cracking in half" di Google Flow.
3. **01 Nastar Klasik**, aksen karamel. Bahan: selai nanas, remah butter, cengkih.
4. **02 Choco Coconut Cheese**, aksen cokelat tua. Kue cokelat berbalut kelapa parut dengan bulatan keju di tengah. Bahan: kelapa parut melayang, serpihan cokelat, potongan keju.
5. **03 Palm Sugar Cheese**, aksen amber gula aren. Kue renyah gula aren dengan keju. Bahan: bongkah gula aren, lelehan karamel aren, serpihan keju.
6. **04 Sago Matcha**, aksen hijau matcha. Kue sagu bentuk semprit (*piped swirl*) hijau. Bahan: kepulan bubuk matcha, butiran sagu.
   - Antar varian ada **transisi**: kue raksasa berubah jadi varian berikutnya.
7. **Susun Paket Hampers-mu**: pilih 3 toples (boleh sama), box tampil terisi sesuai pilihan, harga paket, tombol checkout. Ada juga opsi beli satuan.
8. **Info**: jam dapur, batas kirim hari ini, tombol "Pesan via WhatsApp".
9. **Footer**: WhatsApp, Instagram, butter Wisman, halal/PIRT (dummy).

## 6. Katalog (sesuai price list TOCOK'S)

Semua kue dalam **toples kokoh 350 g**, dibuat dengan **butter Wisman**.

| ID | Produk | Harga | Harga coret | Tagline (usulan) | Komposisi (usulan, perlu konfirmasi) | Aksen |
| --- | --- | --- | --- | --- | --- | --- |
| `nastar-klasik` | Nastar Klasik | Rp90.000 | Rp100.000 | *Selai nanas lembut, dibungkus butter Wisman.* | Tepung, butter Wisman, kuning telur, selai nanas, cengkih | `#E39A3B` |
| `choco-coconut-cheese` | Choco Coconut Cheese | Rp90.000 | Rp100.000 | *Cokelat, kelapa, dan keju dalam satu gigitan.* | Tepung, butter Wisman, cokelat, kelapa parut, keju | `#5A3424` |
| `palm-sugar-cheese` | Palm Sugar Cheese | Rp90.000 | Rp100.000 | *Manis gula aren, gurih keju, renyah sampai remah terakhir.* | Tepung, butter Wisman, gula aren, keju | `#B5652A` |
| `sago-matcha` | Sago Matcha | Rp90.000 | Rp100.000 | *Lumer di lidah, wangi matcha.* | Tepung sagu, butter Wisman, matcha, susu (tanpa keju) | `#8FAE4A` |

**Paket Hampers**: 3 kue pilihan dalam toples 350 g, bisa disesuaikan sesuai permintaan, sudah termasuk box. **Rp290.000** (harga coret Rp325.000).

## 7. Kebutuhan fungsional

| # | Kebutuhan | Prioritas |
| --- | --- | --- |
| F1 | Hero dengan wordmark TOCOK'S dan nastar raksasa, animasi idle halus | Wajib |
| F2 | Video pembuka dan transisi antar varian di-*scrub* oleh scroll, bisa maju-mundur | Wajib |
| F3 | Section varian sticky dengan teks masuk bertahap dan warna aksen berganti | Wajib |
| F4 | Pill navigasi varian dengan scroll-spy dan klik lompat ke section | Wajib |
| F5 | Tombol "Masukkan ke hampers" + badge "Hampers: n dari 3", plus "Beli satuan" | Wajib |
| F6 | Konfigurator Paket Hampers: tepat 3 toples, boleh varian sama; harga Rp290.000. Pembelian satuan Rp90.000/toples | Wajib |
| F7 | Checkout lewat backend brand (`POST /api/v1/storefront/checkout`), Xendit TEST, atribusi `afihub_click_id` seperti brand lain | Wajib |
| F8 | Jejak kursor remah (desktop); dimatikan di layar sentuh | Sebaiknya |
| F9 | Status dapur buka/tutup dan batas kirim hari ini | Sebaiknya |
| F10 | Tombol "Pesan via WhatsApp" dengan pesan terisi otomatis | Sebaiknya |
| F11 | Toggle suara (default off) | Opsional |

## 8. Kebutuhan non-fungsional

- **Responsif**: di HP, kue raksasa pindah ke atas-tengah, teks varian di bawahnya; pill varian bisa di-scroll horizontal.
- **Aksesibilitas**: hormati `prefers-reduced-motion` (ganti scrub dengan crossfade gambar statis); kontras teks ≥ 4,5:1; semua tombol bisa dipakai dengan keyboard.
- **Performa**: frame sequence WebP/AVIF, dimuat bertahap; versi HP resolusi lebih kecil; fallback gambar statis jika koneksi lambat.
- **SEO**: konten teks tetap di HTML, meta OG dengan gambar hero.

## 9. Arah visual

- **Tanpa nuansa musiman**: tidak memakai ornamen dari price list (bulan sabit, bintang gantung, bedug, mandala, kubah, "Happy Eid Mubarak"). Logo bulat emas TOCOK'S boleh dipakai sebagai favicon atau badge kecil.
- **Gaya restrained/editorial** (sesuai mockup yang disetujui): satu objek kuat, banyak ruang kosong gelap, garis tipis sebagai pemisah, tanpa kartu yang menyala, tanpa ikon dekoratif, dan efek partikel secukupnya.
- **Palet**: latar cokelat kakao gelap `#1E120C` → `#0C0705`, sorotan karamel `#D98B3A`, teks krem `#FBF1DC`, aksen per varian (tabel di atas).
- **Tipografi**: wordmark dan judul sans tebal lebar; tagline serif italic; teks isi sans bersih.
- **Fotografi**: makro realistis, warna keemasan dan mengilap seperti nastar di hero (bukan pucat), cahaya dari atas, sedikit film grain.

## 10. Rencana aset

| Aset | Status | Keterangan |
| --- | --- | --- |
| Mockup hero | ✅ Disetujui | `design/mockup-01-hero.png` |
| Mockup section Nastar | ✅ Disetujui | Di ChatGPT, perlu disimpan ke `design/` |
| Mockup Paket Hampers | ⚠️ Perlu dibuat ulang | Versi lama masih berisi produk dan harga lama |
| Video pembuka nastar | ✅ Selesai | Google Flow, "Nastar cracking in half" |
| Still varian: Choco Coconut Cheese, Palm Sugar Cheese, Sago Matcha raksasa | Belum | Gaya, cahaya, dan latar sama dengan nastar |
| Video transisi (3 klip) | Belum | Nastar → Choco Coconut → Palm Sugar → Sago Matcha |
| Ekstraksi frame | Saat implementasi | ffmpeg → WebP |

## 11. Teknologi

- Vite + React 19 (sama seperti brand dummy lain), backend `backend/` per brand (SQLite, Xendit TEST, outbox Afihub).
- Animasi scroll: GSAP ScrollTrigger + `<canvas>` frame sequence; Lenis untuk smooth scroll.
- Partikel kursor: canvas 2D ringan.

## 12. Tahapan

| Tahap | Hasil | Siapa |
| --- | --- | --- |
| 1 | PRD + mockup desain web | ✅ Claude |
| 2 | Persetujuan desain | ✅ Anda (hero + Nastar) |
| 3 | Video pembuka | ✅ Claude (Google Flow) |
| 4 | Still + video transisi 3 varian, mockup hampers baru | ✅ Selesai |
| 5 | Implementasi frontend + backend, ekstraksi frame | ✅ Claude (lihat README.md) |
| 6 | QA (desktop/HP, reduced motion, checkout TEST) | Tes otomatis ✅; checkout TEST nyata & Afihub merchant: Anda |

## 13. Keputusan

- v0.2: tanpa nuansa Lebaran/musiman, karena website dibuka sepanjang tahun.
- v0.3: objek utama nastar raksasa (bukan toples) agar lebih menggugah selera.
- v0.3: gaya visual restrained/editorial; versi yang terlalu ramai ditolak karena terlihat "AI slop".
- v0.4: katalog mengikuti produk asli TOCOK'S (4 varian 350 g @Rp90.000 + Paket Hampers Rp290.000).

- v0.4: Sago Matcha **tanpa keju**; nama ditulis **TOCOK'S** (dengan apostrof); WhatsApp 0895-3968-50847 boleh dipakai di website.

## 14. Pertanyaan terbuka

1. Komposisi Nastar Klasik, Choco Coconut Cheese, dan Palm Sugar Cheese di tabel katalog sudah benar?
2. Harga coret (Rp100.000 / Rp325.000) ditampilkan permanen atau hanya saat promo?
