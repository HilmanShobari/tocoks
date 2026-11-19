import { useEffect, useRef } from 'react';

const COLORS = ['#e9b46a', '#d58b3e', '#f3d9a4', '#b9824f'];

/** Jejak remah kue mengikuti kursor (hanya pointer presisi, dimatikan bila reduced motion). */
export default function Crumbs() {
  const ref = useRef(null);
  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduced) return undefined;
    const canvas = ref.current;
    const context = canvas.getContext('2d');
    const particles = [];
    let raf = 0;
    let last = { x: 0, y: 0, t: 0 };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const tick = () => {
      raf = 0;
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= 1;
        p.vy += 0.09;
        p.x += p.vx;
        p.y += p.vy;
        p.r *= 0.992;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        context.globalAlpha = Math.min(1, p.life / 30);
        context.fillStyle = p.color;
        context.beginPath();
        context.ellipse(p.x, p.y, p.r, p.r * 0.75, p.rot, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      if (particles.length) raf = requestAnimationFrame(tick);
    };
    const move = event => {
      const now = performance.now();
      const distance = Math.hypot(event.clientX - last.x, event.clientY - last.y);
      if (now - last.t < 28 || distance < 6) return;
      last = { x: event.clientX, y: event.clientY, t: now };
      const count = Math.min(3, 1 + Math.floor(distance / 40));
      for (let i = 0; i < count && particles.length < 90; i++) {
        particles.push({ x: event.clientX + (Math.random() - 0.5) * 6, y: event.clientY + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 1.2, vy: -Math.random() * 0.8, r: 1.2 + Math.random() * 2.2,
          rot: Math.random() * Math.PI, life: 40 + Math.random() * 30, color: COLORS[(Math.random() * COLORS.length) | 0] });
      }
      if (!raf) raf = requestAnimationFrame(tick);
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', move);
    };
  }, []);
  return <canvas ref={ref} className="crumbs" aria-hidden="true" />;
}
