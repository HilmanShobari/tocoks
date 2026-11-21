import { useEffect, useRef, useState } from 'react';
import { brand, jars, formatPrice } from './brand.js';
import { CLIPS, HOLDS, TOTAL, activeVariant, ease, frameAt, frameUrl, panelOpacity, smooth } from './sequence.js';

const COOKIE_IN_FRAME = { x: 0.516, y: 0.448, d: 0.31 }; // posisi nastar utuh pada frame pertama
const BG = '#110603';

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** Memuat frame secara bertahap: intro dulu, lalu klip berikutnya. */
function createFrameStore(res, onProgress) {
  const images = CLIPS.map(clip => new Array(clip.frames).fill(null));
  const ready = CLIPS.map(clip => new Array(clip.frames).fill(false));
  let cancelled = false;
  let loaded = 0;
  const total = CLIPS.reduce((sum, clip) => sum + clip.frames, 0);
  const queue = [];
  CLIPS.forEach((clip, c) => {
    queue.push([c, 0], [c, clip.frames - 1]);
  });
  CLIPS.forEach((clip, c) => {
    // Kerangka kasar dulu (setiap frame ke-6) agar scrub langsung terasa, lalu sisanya.
    for (let i = 6; i < clip.frames - 1; i += 6) queue.push([c, i]);
  });
  CLIPS.forEach((clip, c) => {
    for (let i = 1; i < clip.frames - 1; i++) if (i % 6) queue.push([c, i]);
  });
  const seen = new Set();
  const order = queue.filter(([c, i]) => { const key = c + ':' + i; if (seen.has(key)) return false; seen.add(key); return true; });
  let next = 0;
  function pump() {
    if (cancelled || next >= order.length) return;
    const [c, i] = order[next++];
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (cancelled) return;
      images[c][i] = image;
      ready[c][i] = true;
      loaded++;
      onProgress(loaded / total, c, i);
      pump();
    };
    image.onerror = () => { loaded++; pump(); };
    image.src = frameUrl(c, res, i);
  }
  for (let k = 0; k < 6; k++) pump();
  return {
    get(clip, frame) {
      if (ready[clip][frame]) return images[clip][frame];
      for (let d = 1; d < CLIPS[clip].frames; d++) {
        if (frame - d >= 0 && ready[clip][frame - d]) return images[clip][frame - d];
        if (frame + d < CLIPS[clip].frames && ready[clip][frame + d]) return images[clip][frame + d];
      }
      return null;
    },
    cancel() { cancelled = true; },
  };
}

export default function Stage({ cart, onAddToHampers, onBuySingle, onActiveChange, stageRef }) {
  const reduced = useReducedMotion();
  const canvasRef = useRef(null);
  const heroSlotRef = useRef(null);
  const wordLeftRef = useRef(null);
  const wordRightRef = useRef(null);
  const heroRef = useRef(null);
  const panelsRef = useRef([]);
  const dotsRef = useRef([]);
  const [loadedShare, setLoadedShare] = useState(0);
  const [mobile, setMobile] = useState(() => window.innerWidth < 760);

  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 760);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const context = canvas.getContext('2d', { alpha: false });
    let width = 0;
    let height = 0;
    let dpr = 1;
    let shown = '';
    let smoothPos = null;
    let raf = 0;
    let lastActive = -1;
    let heroGeom = null;
    let targetClip = -1;
    let disposed = false;

    const store = createFrameStore(mobile ? 'm' : 'd', (share, clip) => {
      setLoadedShare(share);
      if (targetClip === clip) { shown = ''; request(); }
    });
    const stills = jars.map((product, clip) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (!disposed && targetClip === clip) { shown = ''; request(); }
      };
      image.src = product.still;
      return image;
    });

    function measureHero() {
      const slot = heroSlotRef.current?.getBoundingClientRect();
      if (!slot || !slot.width) return null;
      // Di layar kecil, nastar diperbesar agar tidak terlihat seperti titik di antara huruf.
      const scale = width < 760 ? 1.25 : 1;
      const W = (slot.width / COOKIE_IN_FRAME.d) * scale;
      const H = (W * 9) / 16;
      return { x: slot.left + slot.width / 2 - COOKIE_IN_FRAME.x * W, y: slot.top + slot.height / 2 - COOKIE_IN_FRAME.y * H, w: W };
    }

    function fullGeom() {
      if (width < 760) {
        const W = width * 1.5;
        return { x: width / 2 - W / 2, y: height * 0.32 - (W * 9) / 32, w: W };
      }
      const W = Math.min(width * 0.96, ((height * 16) / 9) * 1.12);
      return { x: width * 0.66 - W / 2, y: height * 0.53 - (W * 9) / 32, w: W };
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      heroGeom = null;
      shown = '';
      request();
    }

    function stagePos() {
      const rect = stage.getBoundingClientRect();
      const scrollable = rect.height - height;
      const progress = Math.min(Math.max(-rect.top / scrollable, 0), 1);
      return progress * TOTAL;
    }

    function paintBackground() {
      // Warna polos sama dengan tepi frame, supaya frame yang di-feather menyatu tanpa garis.
      context.fillStyle = BG;
      context.fillRect(0, 0, width, height);
    }

    function feather(x, y, w, h) {
      const f = Math.min(w, h) * 0.16;
      const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => {
        const g = context.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, 'rgba(18,7,3,1)');
        g.addColorStop(1, 'rgba(18,7,3,0)');
        context.fillStyle = g;
        context.fillRect(rx, ry, rw, rh);
      };
      if (x > -1) edge(x, 0, x + f, 0, x - 1, y, f + 1, h);
      if (x + w < width + 1) edge(x + w, 0, x + w - f, 0, x + w - f, y, f + 1, h);
      if (y > -1) edge(0, y, 0, y + f * 0.8, x, y - 1, w, f * 0.8 + 1);
      if (y + h < height + 1) edge(0, y + h, 0, y + h - f, x, y + h - f, w, f + 1);
    }

    function draw(pos) {
      const { clip, frame } = frameAt(pos, reduced);
      targetClip = clip;
      if (!heroGeom) heroGeom = measureHero();
      const full = fullGeom();
      const k = reduced ? (pos > 30 ? 1 : 0) : ease(pos / 80);
      const from = heroGeom || full;
      const geom = { x: from.x + (full.x - from.x) * k, y: from.y + (full.y - from.y) * k, w: from.w + (full.w - from.w) * k };
      const key = `${clip}:${frame}:${Math.round(geom.x)}:${Math.round(geom.y)}:${Math.round(geom.w)}:${width}x${height}`;
      if (key === shown) return;
      const image = store.get(clip, frame);
      const still = stills[clip];
      const source = image || (still?.complete && still.naturalWidth ? still : null);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintBackground();
      if (source) {
        const h = (geom.w * 9) / 16;
        context.drawImage(source, geom.x, geom.y, geom.w, h);
        feather(geom.x, geom.y, geom.w, h);
        shown = key;
      } else shown = '';
    }

    function overlays(pos) {
      // Hero: wordmark terbelah saat nastar mulai retak.
      const heroFade = 1 - smooth(6, 44, pos);
      const spread = reduced ? 0 : ease(pos / 60);
      if (heroRef.current) {
        heroRef.current.style.opacity = heroFade.toFixed(3);
        heroRef.current.style.visibility = heroFade <= 0.001 ? 'hidden' : 'visible';
      }
      if (wordLeftRef.current) wordLeftRef.current.style.transform = `translate3d(${(-spread * 22).toFixed(2)}vw,0,0)`;
      if (wordRightRef.current) wordRightRef.current.style.transform = `translate3d(${(spread * 22).toFixed(2)}vw,0,0)`;
      panelsRef.current.forEach((panel, i) => {
        if (!panel) return;
        const o = panelOpacity(i, pos);
        panel.style.opacity = o.toFixed(3);
        panel.style.transform = `translate3d(0,${((1 - o) * 26).toFixed(1)}px,0)`;
        panel.style.visibility = o <= 0.001 ? 'hidden' : 'visible';
        panel.inert = o < 0.5;
      });
      const active = activeVariant(pos);
      dotsRef.current.forEach((dot, i) => dot?.classList.toggle('is-active', i === active));
      if (active !== lastActive) {
        lastActive = active;
        onActiveChange(active, pos);
      }
    }

    function frameLoop() {
      raf = 0;
      const target = stagePos();
      if (smoothPos === null || reduced) smoothPos = target;
      else smoothPos += (target - smoothPos) * 0.2;
      if (Math.abs(target - smoothPos) < 0.05) smoothPos = target;
      draw(smoothPos);
      overlays(smoothPos);
      if (smoothPos !== target) request();
    }

    function request() { if (!raf) raf = requestAnimationFrame(frameLoop); }

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', request, { passive: true });
    document.fonts?.ready.then(() => { heroGeom = null; shown = ''; request(); });
    return () => {
      disposed = true;
      store.cancel();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', request);
    };
  }, [mobile, reduced, stageRef, onActiveChange]);

  const draftCount = cart.draft.length;
  return (
    <section className="stage" ref={stageRef} style={{ height: `${TOTAL + 100}vh` }} aria-label="Varian kue TOCOK'S">
      <div className="stage-sticky">
        <canvas ref={canvasRef} className="stage-canvas" aria-hidden="true" />
        <div className="stage-shade" aria-hidden="true" />

        <div className="hero" ref={heroRef}>
          <h1 className="hero-wordmark" aria-label="TOCOK'S">
            <span ref={wordLeftRef} aria-hidden="true">T</span>
            <span className="hero-o" ref={heroSlotRef} aria-hidden="true" />
            <span ref={wordRightRef} aria-hidden="true">COK’S</span>
          </h1>
          <p className="hero-tagline">{brand.tagline}</p>
          <p className="hero-scroll" aria-hidden="true">
            {loadedShare < 0.15 ? `Memanggang ${Math.round(loadedShare / 0.15 * 100)}%` : 'Scroll'}
          </p>
        </div>

        {jars.map((product, i) => (
          <article
            key={product.id}
            className="variant-panel"
            ref={el => { panelsRef.current[i] = el; }}
            style={{ '--accent': product.accent }}
            aria-labelledby={'variant-' + product.id}
          >
            <p className="eyebrow">{String(i + 1).padStart(2, '0')} / 04 — {product.name}</p>
            <h2 id={'variant-' + product.id}>{product.name}</h2>
            <p className="variant-tagline">{product.tagline}</p>
            <p className="variant-price">
              <strong>{formatPrice(product.price)}</strong> <span>/ {product.weight}</span> <s>{formatPrice(product.compareAt)}</s>
            </p>
            <div className="variant-actions">
              <button className="button button-cream" type="button" onClick={() => onAddToHampers(product)} disabled={draftCount >= brand.hamperSlots}>
                {draftCount >= brand.hamperSlots ? 'Hampers sudah penuh' : 'Masukkan ke hampers'}
              </button>
              <button className="text-link" type="button" onClick={() => onBuySingle(product)}>
                Beli satuan →
              </button>
            </div>
          </article>
        ))}

        <ol className="stage-dots" aria-hidden="true">
          {HOLDS.map((hold, i) => <li key={i} ref={el => { dotsRef.current[i] = el; }} />)}
        </ol>
      </div>
    </section>
  );
}
