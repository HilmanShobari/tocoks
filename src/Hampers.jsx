import { brand, hampers, jars, productById, formatPrice } from './brand.js';

function Jar({ product }) {
  if (!product) {
    return (
      <div className="jar jar-empty">
        <span>Pilih toples</span>
      </div>
    );
  }
  return (
    <div className="jar" style={{ '--accent': product.accent }}>
      <div className="jar-lid" />
      <div className="jar-glass">
        {Array.from({ length: 6 }, (_, i) => (
          <img key={i} src={product.image} alt="" loading="lazy" style={{ '--i': i }} />
        ))}
      </div>
      <span className="jar-label">{product.short}</span>
    </div>
  );
}

export function whatsappLink(text) {
  return `https://wa.me/${brand.whatsapp}?text=${encodeURIComponent(text)}`;
}

export default function Hampers({ cart, onAdd, onRemove, onCheckout }) {
  const draft = cart.draft;
  const remaining = brand.hamperSlots - draft.length;
  const slots = Array.from({ length: brand.hamperSlots }, (_, i) => productById(draft[i]));
  const summary = jars
    .map(jar => [jar, draft.filter(id => id === jar.id).length])
    .filter(([, n]) => n)
    .map(([jar, n]) => `${jar.name}${n > 1 ? ' ×' + n : ''}`)
    .join(', ');
  const waText = draft.length
    ? `Halo TOCOK'S, saya mau pesan Paket Hampers isi: ${summary}${remaining ? ` (masih pilih ${remaining} toples lagi)` : ''}.`
    : "Halo TOCOK'S, saya mau tanya soal Paket Hampers.";

  return (
    <section className="hampers" id="hampers" aria-labelledby="hampers-title">
      <div className="hampers-head">
        <p className="eyebrow">05 — Paket Hampers</p>
        <h2 id="hampers-title">Tiga toples, satu kotak.</h2>
        <p className="serif-line">Untuk suguhan, oleh-oleh, atau hadiah.</p>
      </div>

      <div className="hampers-body">
        <div className="hamper-box" aria-label={`Isi box: ${summary || 'belum ada toples'}`}>
          <div className="hamper-lid" aria-hidden="true">
            <span>TOCOK’S</span>
          </div>
          <div className="hamper-tray">
            {slots.map((product, i) => <Jar key={i + (product?.id || 'empty')} product={product} />)}
          </div>
        </div>

        <div className="hamper-picker">
          <ul className="picker-list">
            {jars.map(jar => {
              const count = draft.filter(id => id === jar.id).length;
              return (
                <li key={jar.id}>
                  <img src={jar.image} alt="" loading="lazy" />
                  <div className="picker-name">
                    <strong>{jar.name}</strong>
                    <span>{jar.weight}</span>
                  </div>
                  <div className="picker-price">
                    <strong>{formatPrice(jar.price)}</strong>
                    <s>{formatPrice(jar.compareAt)}</s>
                  </div>
                  <div className="stepper" role="group" aria-label={`Jumlah ${jar.name} di hampers`}>
                    <button type="button" onClick={() => onRemove(jar.id)} disabled={!count} aria-label={`Kurangi ${jar.name}`}>−</button>
                    <output aria-live="polite">{count}</output>
                    <button type="button" onClick={() => onAdd(jar)} disabled={!remaining} aria-label={`Tambah ${jar.name}`}>+</button>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="serif-line picker-hint">
            {remaining ? `Pilih ${remaining} toples lagi` : 'Box sudah penuh, siap dikemas.'}
          </p>
          <p className="picker-total">
            <strong>{formatPrice(hampers.price)}</strong> <s>{formatPrice(hampers.compareAt)}</s>
          </p>
          <p className="picker-note">Termasuk box · butter Wisman · 3 × 350 g</p>
          <div className="picker-actions">
            <button className="button button-cream" type="button" disabled={remaining > 0} onClick={onCheckout}>
              Checkout hampers
            </button>
            <a className="text-link" href={whatsappLink(waText)} target="_blank" rel="noreferrer">
              Pesan via WhatsApp →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
