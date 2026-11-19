import { loadEnvironment, loadAfihubConfig } from './config.mjs';
loadEnvironment();
const config = loadAfihubConfig();
console.log(config ? 'SDK Afihub: 3 variabel backend terkonfigurasi. Cocokkan Merchant ID dengan Brand Portal dan frontend sebelum uji transaksi.' : 'SDK Afihub belum dikonfigurasi. Isi AFIHUB_MERCHANT_ID, AFIHUB_WEBHOOK_SECRET, AFIHUB_CONVERSION_URL pada backend/.env dari Brand Portal.');
console.log('Setup tidak membaca database Afihub, tidak membuat akun, dan tidak mencetak secret.');
