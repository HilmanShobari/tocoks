import { useCallback, useEffect, useState } from 'react';
import { brand, hampers, jars, productById } from './brand.js';

const CART_KEY = 'store-cart:' + brand.slug;
const empty = () => ({ draft: [], hampers: [], singles: {} });

function load() {
  try {
    const value = JSON.parse(window.localStorage.getItem(CART_KEY) || 'null');
    if (!value || typeof value !== 'object') return empty();
    const valid = id => jars.some(jar => jar.id === id);
    return {
      draft: Array.isArray(value.draft) ? value.draft.filter(valid).slice(0, brand.hamperSlots) : [],
      hampers: Array.isArray(value.hampers)
        ? value.hampers.filter(box => Array.isArray(box.jars) && box.jars.length === brand.hamperSlots && box.jars.every(valid) && Number.isInteger(box.quantity) && box.quantity > 0)
        : [],
      singles: Object.fromEntries(Object.entries(value.singles || {}).filter(([id, qty]) => valid(id) && Number.isInteger(qty) && qty > 0)),
    };
  } catch {
    return empty();
  }
}

const boxKey = list => [...list].sort().join('+');

/** Ringkasan baris pesanan untuk tampilan dan payload checkout. */
export function cartLines(cart) {
  const lines = [];
  for (const box of cart.hampers) {
    const counts = box.jars.reduce((map, id) => map.set(id, (map.get(id) || 0) + 1), new Map());
    lines.push({
      key: 'h:' + boxKey(box.jars), kind: 'hampers', product: hampers, quantity: box.quantity, jars: box.jars,
      label: hampers.name, detail: [...counts].map(([id, n]) => productById(id).short + (n > 1 ? ' ×' + n : '')).join(' · '),
      total: hampers.price * box.quantity,
    });
  }
  for (const [id, quantity] of Object.entries(cart.singles)) {
    const product = productById(id);
    lines.push({ key: 's:' + id, kind: 'jar', product, quantity, label: product.name, detail: product.weight, total: product.price * quantity });
  }
  return lines;
}

export function cartTotals(cart) {
  const subtotal = cartLines(cart).reduce((sum, line) => sum + line.total, 0);
  // Tampilan saja; server menghitung ulang harga dan ongkir dari katalog.
  const shipping = subtotal === 0 || subtotal >= 300000 ? 0 : 15000;
  return { subtotal, shipping, total: subtotal + shipping, count: cartLines(cart).reduce((n, line) => n + line.quantity, 0) };
}

export function checkoutItems(cart) {
  return [
    ...cart.hampers.map(box => ({ product_id: hampers.id, quantity: box.quantity, jars: [...box.jars].sort() })),
    ...Object.entries(cart.singles).map(([product_id, quantity]) => ({ product_id, quantity })),
  ];
}

export function useCart() {
  const [cart, setCart] = useState(load);

  useEffect(() => {
    try { window.localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* Penyimpanan browser opsional. */ }
  }, [cart]);

  useEffect(() => {
    const sync = event => { if (event.key === CART_KEY) setCart(load()); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const addToDraft = useCallback(id => {
    let added = false;
    setCart(current => {
      if (current.draft.length >= brand.hamperSlots) return current;
      added = true;
      return { ...current, draft: [...current.draft, id] };
    });
    return added;
  }, []);

  const removeFromDraft = useCallback(id => {
    setCart(current => {
      const index = current.draft.lastIndexOf(id);
      if (index < 0) return current;
      const draft = [...current.draft];
      draft.splice(index, 1);
      return { ...current, draft };
    });
  }, []);

  const commitDraft = useCallback(() => {
    setCart(current => {
      if (current.draft.length !== brand.hamperSlots) return current;
      const key = boxKey(current.draft);
      const existing = current.hampers.find(box => boxKey(box.jars) === key);
      const nextHampers = existing
        ? current.hampers.map(box => (box === existing ? { ...box, quantity: Math.min(20, box.quantity + 1) } : box))
        : [...current.hampers, { jars: [...current.draft], quantity: 1 }];
      return { ...current, draft: [], hampers: nextHampers };
    });
  }, []);

  const addSingle = useCallback(id => {
    setCart(current => ({ ...current, singles: { ...current.singles, [id]: Math.min(99, (current.singles[id] || 0) + 1) } }));
  }, []);

  const setLineQuantity = useCallback((line, quantity) => {
    setCart(current => {
      if (line.kind === 'hampers') {
        const key = boxKey(line.jars);
        return { ...current, hampers: current.hampers.flatMap(box => (boxKey(box.jars) === key ? (quantity > 0 ? [{ ...box, quantity: Math.min(20, quantity) }] : []) : [box])) };
      }
      const singles = { ...current.singles };
      if (quantity > 0) singles[line.product.id] = Math.min(99, quantity);
      else delete singles[line.product.id];
      return { ...current, singles };
    });
  }, []);

  const clearOrdered = useCallback(() => setCart(current => ({ ...empty(), draft: current.draft })), []);

  return { cart, addToDraft, removeFromDraft, commitDraft, addSingle, setLineQuantity, clearOrdered };
}
