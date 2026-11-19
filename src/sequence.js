// Frame sequence hasil ekstraksi video Google Flow (lihat README: "Membuat ulang frame").
export const CLIPS = [
  { id: '01-intro', frames: 91 },
  { id: '02-nastar-choco', frames: 81 },
  { id: '03-choco-palm', frames: 95 },
  { id: '04-palm-matcha', frames: 91 },
];

// Panjang tiap bagian scroll dalam satuan vh. Clip = animasi, hold = layar varian diam.
export const SEGMENTS = [
  { kind: 'clip', clip: 0, len: 150 },
  { kind: 'hold', variant: 0, len: 100 },
  { kind: 'clip', clip: 1, len: 120 },
  { kind: 'hold', variant: 1, len: 100 },
  { kind: 'clip', clip: 2, len: 120 },
  { kind: 'hold', variant: 2, len: 100 },
  { kind: 'clip', clip: 3, len: 120 },
  { kind: 'hold', variant: 3, len: 110 },
];

let cursor = 0;
for (const segment of SEGMENTS) {
  segment.start = cursor;
  cursor += segment.len;
  segment.end = cursor;
}
export const TOTAL = cursor;
export const HOLDS = SEGMENTS.filter(segment => segment.kind === 'hold');

export const frameUrl = (clip, res, index) => `/frames/${CLIPS[clip].id}/${res}/${String(index + 1).padStart(3, '0')}.webp`;

/** Posisi scroll (vh) → frame yang ditampilkan. */
export function frameAt(pos, reducedMotion) {
  const p = Math.min(Math.max(pos, 0), TOTAL - 0.001);
  const index = SEGMENTS.findIndex(segment => p >= segment.start && p < segment.end);
  const segment = SEGMENTS[index];
  if (segment.kind === 'hold') {
    const clip = SEGMENTS[index - 1].clip;
    return { clip, frame: CLIPS[clip].frames - 1 };
  }
  const t = (p - segment.start) / segment.len;
  const count = CLIPS[segment.clip].frames;
  if (reducedMotion) return { clip: segment.clip, frame: segment.clip === 0 ? (t < 0.5 ? 0 : count - 1) : t < 0.5 ? 0 : count - 1 };
  return { clip: segment.clip, frame: Math.round(t * (count - 1)) };
}

const smooth = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Opasitas panel varian i pada posisi scroll. */
export function panelOpacity(i, pos) {
  const hold = HOLDS[i];
  const fadeIn = smooth(hold.start - 34, hold.start - 4, pos);
  const fadeOut = i === HOLDS.length - 1 ? 1 : 1 - smooth(hold.end + 4, hold.end + 26, pos);
  return Math.min(fadeIn, fadeOut);
}

export function activeVariant(pos) {
  let active = 0;
  HOLDS.forEach((hold, i) => { if (pos >= hold.start - 40) active = i; });
  return active;
}

export const ease = x => {
  const t = Math.min(Math.max(x, 0), 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export { smooth };
