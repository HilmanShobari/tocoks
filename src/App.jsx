import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { brand, jars, productById, formatPrice } from './brand.js';
import { checkoutAttempt } from './attribution.js';
import { cartLines, cartTotals, checkoutItems, useCart } from './cart.js';
import Stage from './Stage.jsx';
import Hampers, { whatsappLink } from './Hampers.jsx';
import Crumbs from './Crumbs.jsx';
import { HOLDS, TOTAL } from './sequence.js';

const API_BASE = (import.meta.env.VITE_CHECKOUT_API_URL || '/api/v1').replace(/\/$/, '');

async function requestJSON(path, options = {}) {
  const response = await fetch(API_BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) {
    throw new Error(result.message || result.error || 'Permintaan belum berhasil. Coba lagi.');
  }
  return result.data ?? result;
}

function jakartaNow() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const get = type => Number(parts.find(part => part.type === type)?.value || 0);
  return get('hour') * 60 + get('minute');
}
const minutes = value => { const [h, m] = value.split('.').map(Number); return h * 60 + m; };

function Wordmark({ className = '' }) {
  return <a className={'wordmark ' + className} href="/">TOCOK’S</a>;
}

function Header({ active, onJump, cart, totals, onOpenCart }) {
  return (
    <header className="site-header">
      <Wordmark />
      <nav className="variant-nav" aria-label="Varian kue">
        {jars.map((jar, i) => (
          <button key={jar.id} type="button" className={'pill' + (active === i ? ' is-active' : '')} onClick={() => onJump(i)} aria-current={active === i ? 'true' : undefined}>
            {jar.short}
          </button>
        ))}
      </nav>
      <div className="header-actions">
        <a className="pill pill-accent" href="#hampers" aria-label={`Hampers: ${cart.draft.length} dari ${brand.hamperSlots}`}>
          <span className="desktop-only">Hampers: {cart.draft.length} dari {brand.hamperSlots}</span>
          <span className="mobile-only">Hampers {cart.draft.length}/{brand.hamperSlots}</span>
        </a>
        {totals.count > 0 && (
          <button type="button" className="pill" onClick={onOpenCart}>
            Keranjang · {totals.count}
          </button>
        )}
      </div>
    </header>
  );
}

function KitchenStrip() {
  const [now, setNow] = useState(jakartaNow);
  useEffect(() => {
    const timer = setInterval(() => setNow(jakartaNow()), 60000);
    return () => clearInterval(timer);
  }, []);
  const open = now >= minutes(brand.kitchen.open) && now < minutes(brand.kitchen.close);
  const sameDay = now < minutes(brand.kitchen.sameDayCutoff);
  return (
    <section className="kitchen-strip" aria-label="Informasi toko">
      <div>
        <span className="fact-label">Jam dapur</span>
        <p><i className={'status-dot' + (open ? ' is-open' : '')} aria-hidden="true" />{open ? `Buka hari ini ${brand.kitchen.open}–${brand.kitchen.close}` : `Tutup, buka lagi pukul ${brand.kitchen.open}`}</p>
      </div>
      <div>
        <span className="fact-label">Pengiriman</span>
        <p>{sameDay ? `Pesan sebelum ${brand.kitchen.sameDayCutoff}, dikirim hari ini` : 'Pesanan sekarang dikirim besok pagi'}</p>
      </div>
      <div>
        <span className="fact-label">WhatsApp</span>
        <p><a href={whatsappLink("Halo TOCOK'S, saya mau pesan kue.")} target="_blank" rel="noreferrer">{brand.whatsappDisplay}</a></p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <Wordmark className="wordmark-large" />
      <p className="serif-line">{brand.descriptor}. Dibuat dengan butter Wisman, dikemas dalam toples 350 g.</p>
      <div className="footer-meta">
        <a href={whatsappLink("Halo TOCOK'S!")} target="_blank" rel="noreferrer">WhatsApp {brand.whatsappDisplay}</a>
        <span>Pembayaran aman melalui Xendit</span>
        <span>© {new Date().getFullYear()} TOCOK’S</span>
      </div>
    </footer>
  );
}

function CartDrawer({ open, onClose, lines, totals, onQuantity }) {
  const closeRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <div className={'drawer-layer' + (open ? ' is-open' : '')} aria-hidden={!open} inert={!open ? '' : undefined}>
      <button className="drawer-backdrop" type="button" tabIndex={-1} onClick={onClose} aria-label="Tutup keranjang" />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="drawer-head">
          <h2 id="drawer-title">Keranjang</h2>
          <button ref={closeRef} type="button" className="text-link" onClick={onClose}>Tutup</button>
        </div>
        {lines.length === 0 ? (
          <p className="serif-line">Belum ada kue di keranjang.</p>
        ) : (
          <ul className="line-list">
            {lines.map(line => (
              <li key={line.key}>
                <LineImage line={line} />
                <div className="line-name">
                  <strong>{line.label}</strong>
                  <span>{line.detail}</span>
                </div>
                <div className="stepper" role="group" aria-label={`Jumlah ${line.label}`}>
                  <button type="button" onClick={() => onQuantity(line, line.quantity - 1)} aria-label="Kurangi">−</button>
                  <output>{line.quantity}</output>
                  <button type="button" onClick={() => onQuantity(line, line.quantity + 1)} aria-label="Tambah">+</button>
                </div>
                <b>{formatPrice(line.total)}</b>
              </li>
            ))}
          </ul>
        )}
        <div className="totals">
          <div><span>Subtotal</span><strong>{formatPrice(totals.subtotal)}</strong></div>
          <div><span>Pengiriman</span><strong>{totals.subtotal ? (totals.shipping ? formatPrice(totals.shipping) : 'Gratis') : '—'}</strong></div>
          <div className="grand"><span>Total</span><strong>{formatPrice(totals.total)}</strong></div>
        </div>
        <p className="picker-note">Gratis ongkir untuk belanja mulai Rp300.000.</p>
        <a className={'button button-cream button-block' + (lines.length ? '' : ' is-disabled')} href="/checkout" aria-disabled={!lines.length}>Lanjut ke checkout</a>
      </aside>
    </div>
  );
}

function LineImage({ line }) {
  if (line.kind !== 'hampers') return <img src={line.product.image} alt="" />;
  return (
    <span className="line-trio" aria-hidden="true">
      {line.jars.map((id, i) => <img key={i} src={productById(id).image} alt="" />)}
    </span>
  );
}

function Toast({ message }) {
  return <div className={'toast' + (message ? ' is-visible' : '')} role="status" aria-live="polite">{message}</div>;
}

function Storefront({ cartApi }) {
  const { cart, addToDraft, removeFromDraft, commitDraft, addSingle, setLineQuantity } = cartApi;
  const stageRef = useRef(null);
  const [active, setActive] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState('');
  const lines = useMemo(() => cartLines(cart), [cart]);
  const totals = useMemo(() => cartTotals(cart), [cart]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const onActiveChange = useCallback(index => setActive(index), []);

  const jump = useCallback(index => {
    const stage = stageRef.current;
    if (!stage) return;
    const top = stage.getBoundingClientRect().top + window.scrollY;
    const scrollable = stage.offsetHeight - window.innerHeight;
    const pos = HOLDS[index].start + 18;
    window.scrollTo({ top: top + (pos / TOTAL) * scrollable, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, []);

  const addToHampers = useCallback(product => {
    if (cart.draft.length >= brand.hamperSlots) {
      setToast('Hampers sudah berisi 3 toples.');
      return;
    }
    addToDraft(product.id);
    const filled = cart.draft.length + 1;
    setToast(filled === brand.hamperSlots ? `${product.name} masuk. Hampers sudah penuh!` : `${product.name} masuk hampers (${filled}/${brand.hamperSlots}).`);
  }, [cart.draft.length, addToDraft]);

  const buySingle = useCallback(product => {
    addSingle(product.id);
    setDrawer(true);
  }, [addSingle]);

  const checkoutHampers = useCallback(() => {
    commitDraft();
    // Biarkan state tersimpan sebelum pindah halaman.
    setTimeout(() => window.location.assign('/checkout'), 60);
  }, [commitDraft]);

  return (
    <>
      <Header active={active} onJump={jump} cart={cart} totals={totals} onOpenCart={() => setDrawer(true)} />
      <main>
        <Stage cart={cart} stageRef={stageRef} onAddToHampers={addToHampers} onBuySingle={buySingle} onActiveChange={onActiveChange} />
        <Hampers cart={cart} onAdd={addToHampers} onRemove={removeFromDraft} onCheckout={checkoutHampers} />
        <KitchenStrip />
      </main>
      <Footer />
      <CartDrawer open={drawer} onClose={() => setDrawer(false)} lines={lines} totals={totals} onQuantity={setLineQuantity} />
      <Toast message={toast} />
      <Crumbs />
    </>
  );
}

function CheckoutPage({ cartApi }) {
  const { cart, setLineQuantity } = cartApi;
  const lines = cartLines(cart);
  const totals = cartTotals(cart);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', city: '', note: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!lines.length) {
      setError('Keranjangmu masih kosong.');
      return;
    }
    setPending(true);
    setError('');
    try {
      const items = checkoutItems(cart);
      const attempt = checkoutAttempt(items, form);
      const order = await requestJSON('/storefront/checkout', {
        method: 'POST',
        body: JSON.stringify({
          brand_slug: brand.slug,
          session_token: attempt.session_token,
          checkout_key: attempt.checkout_key,
          order_token: attempt.order_token,
          items,
          customer: {
            name: form.name,
            email: form.email,
            phone: form.phone,
            address: form.address + ', ' + form.city + (form.note.trim() ? ' — Catatan: ' + form.note.trim() : ''),
          },
          return_url: window.location.origin + '/checkout/result',
        }),
      });
      try {
        window.sessionStorage.setItem('store-order:' + brand.slug, order.order_id);
        window.sessionStorage.setItem('store-order-token:' + brand.slug + ':' + order.order_id, attempt.order_token);
      } catch { /* URL kembali juga membawa ID pesanan. */ }
      window.location.assign(order.invoice_url);
    } catch (submitError) {
      setError(submitError.message || 'Checkout belum berhasil. Coba lagi.');
      setPending(false);
    }
  }

  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));

  return (
    <main className="page checkout-page">
      <div className="page-top">
        <Wordmark />
        <span className="fact-label">Checkout aman · Xendit</span>
      </div>
      <a className="text-link back-link" href="/">← Kembali ke toko</a>
      <div className="checkout-layout">
        <section>
          <p className="eyebrow">Langkah terakhir</p>
          <h1>Kirim ke mana?</h1>
          <p className="serif-line">Isi detail penerima. Invoice pembayaran dibuka di halaman Xendit.</p>
          <form className="checkout-form" onSubmit={submit}>
            <label>Nama lengkap<input name="name" autoComplete="name" value={form.name} onChange={update} required maxLength="120" /></label>
            <div className="form-row">
              <label>Email<input type="email" name="email" autoComplete="email" value={form.email} onChange={update} required /></label>
              <label>Nomor WhatsApp<input type="tel" name="phone" autoComplete="tel" value={form.phone} onChange={update} required maxLength="30" /></label>
            </div>
            <label>Alamat lengkap<textarea name="address" autoComplete="street-address" value={form.address} onChange={update} required minLength="8" maxLength="300" /></label>
            <div className="form-row">
              <label>Kota / kabupaten<input name="city" autoComplete="address-level2" value={form.city} onChange={update} required maxLength="80" /></label>
              <label>Catatan (opsional)<input name="note" value={form.note} onChange={update} maxLength="90" placeholder="Mis. kartu ucapan" /></label>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-cream button-block" type="submit" disabled={pending || !lines.length}>
              {pending ? 'Menyiapkan invoice…' : 'Bayar ' + formatPrice(totals.total)}
            </button>
            <p className="picker-note">Harga dan ongkir dihitung ulang oleh server toko. Pembayaran dilakukan di halaman Xendit.</p>
          </form>
        </section>
        <aside className="order-summary">
          <h2>Ringkasan pesanan</h2>
          {lines.length === 0 && <p className="serif-line">Keranjang masih kosong. <a href="/#hampers">Susun hampers</a></p>}
          <ul className="line-list">
            {lines.map(line => (
              <li key={line.key}>
                <LineImage line={line} />
                <div className="line-name"><strong>{line.label}</strong><span>{line.detail}</span></div>
                <div className="stepper" role="group" aria-label={`Jumlah ${line.label}`}>
                  <button type="button" onClick={() => setLineQuantity(line, line.quantity - 1)} aria-label="Kurangi">−</button>
                  <output>{line.quantity}</output>
                  <button type="button" onClick={() => setLineQuantity(line, line.quantity + 1)} aria-label="Tambah">+</button>
                </div>
                <b>{formatPrice(line.total)}</b>
              </li>
            ))}
          </ul>
          <div className="totals">
            <div><span>Subtotal</span><strong>{formatPrice(totals.subtotal)}</strong></div>
            <div><span>Pengiriman</span><strong>{totals.subtotal ? (totals.shipping ? formatPrice(totals.shipping) : 'Gratis') : '—'}</strong></div>
            <div className="grand"><span>Total</span><strong>{formatPrice(totals.total)}</strong></div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function ResultPage({ onPaid }) {
  const params = new URLSearchParams(window.location.search);
  const [orderId] = useState(() => {
    try { return params.get('order_id') || sessionStorage.getItem('store-order:' + brand.slug); } catch { return params.get('order_id'); }
  });
  const [orderToken] = useState(() => {
    try { return params.get('order_token') || sessionStorage.getItem('store-order-token:' + brand.slug + ':' + orderId) || ''; } catch { return params.get('order_token') || ''; }
  });
  useEffect(() => {
    if (!orderToken || !orderId) return;
    try {
      sessionStorage.setItem('store-order-token:' + brand.slug + ':' + orderId, orderToken);
      const clean = new URL(location.href);
      clean.searchParams.delete('order_token');
      history.replaceState(null, '', clean);
    } catch { /* Token tetap di URL bila storage diblokir. */ }
  }, [orderId, orderToken]);
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadOrder() {
      if (!orderId) {
        setError('Nomor pesanan tidak ditemukan.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const result = await requestJSON('/storefront/orders/' + encodeURIComponent(orderId) + '?brand_slug=' + encodeURIComponent(brand.slug), { headers: { Authorization: 'Bearer ' + orderToken } });
        if (active) {
          setOrder(result);
          if (['paid', 'fulfilled', 'completed'].includes(result.status)) {
            onPaid();
            try { sessionStorage.removeItem('store-checkout:' + brand.slug); } catch { /* Opsional. */ }
          }
        }
      } catch (loadError) {
        if (active) setError(loadError.message || 'Status pesanan belum dapat dimuat.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadOrder();
    return () => { active = false; };
  }, [orderId, orderToken, attempt, onPaid]);

  useEffect(() => {
    if (!order || !['pending', 'creating', 'invoice_error'].includes(order.status)) return undefined;
    const timer = setTimeout(() => setAttempt(value => value + 1), 5000);
    return () => clearTimeout(timer);
  }, [order, attempt]);

  const paid = ['paid', 'fulfilled', 'completed'].includes(order?.status);
  const reversed = ['refunded', 'cancelled'].includes(order?.status);
  const expired = order?.status === 'expired';
  const failed = order?.status === 'failed' || order?.status === 'invoice_error';
  const terminal = expired || failed || reversed;
  return (
    <main className="page result-page">
      <Wordmark />
      <section className="result-panel">
        <p className="eyebrow">{paid ? 'Pesanan terkonfirmasi' : 'Pembaruan pembayaran'}</p>
        <h1>{paid ? 'Terima kasih! Kuemu segera kami kemas.' : reversed ? 'Pesanan dibatalkan atau dikembalikan.' : expired ? 'Invoice sudah kedaluwarsa.' : failed ? 'Pembayaran belum berhasil.' : 'Pesananmu sedang diproses.'}</h1>
        <p className="serif-line">
          {paid
            ? 'Pembayaran sudah kami terima. Simpan nomor pesanan ini untuk menghubungi kami via WhatsApp.'
            : reversed
              ? 'Status pengembalian atau pembatalan sudah dicatat oleh toko.'
              : expired
                ? 'Waktu pembayaran habis. Keranjangmu masih tersimpan dan kamu bisa membuat invoice baru.'
                : failed
                  ? 'Xendit belum mengonfirmasi pembayaran ini. Kamu bisa mencoba checkout kembali.'
                  : 'Status invoice Xendit sedang diperiksa. Jika kamu baru saja membayar, tunggu sebentar.'}
        </p>
        {orderId && <p className="order-reference">Nomor pesanan <strong>{orderId}</strong></p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {loading && <p className="fact-label">Memeriksa status invoice…</p>}
        {order && !loading && <p className="fact-label">Status: {order.status}</p>}
        <div className="picker-actions">
          {!paid && !terminal && (
            <button className="button button-ghost" type="button" onClick={() => setAttempt(value => value + 1)} disabled={loading}>Periksa status lagi</button>
          )}
          {terminal && <a className="button button-ghost" href="/checkout">Buat invoice baru</a>}
          <a className="button button-cream" href="/">Kembali ke toko</a>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const cartApi = useCart();
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/checkout/result') return <ResultPage onPaid={cartApi.clearOrdered} />;
  if (path === '/checkout') return <CheckoutPage cartApi={cartApi} />;
  return <Storefront cartApi={cartApi} />;
}
