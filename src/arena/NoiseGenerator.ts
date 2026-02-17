// 2D simplex noise with seeded RNG
// Adapted from Stefan Gustavson's simplex implementation

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const grad2 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

export class NoiseGenerator {
  private perm: Uint8Array;

  constructor(seed: number) {
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    // Seeded shuffle
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed | 0;
    for (let i = 255; i > 0; i--) {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      const j = ((s >>> 0) % (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  noise2D(x: number, y: number): number {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    const ii = i & 255;
    const jj = j & 255;

    let n0 = 0, n1 = 0, n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      const gi = this.perm[ii + this.perm[jj]] % 8;
      n0 = t0 * t0 * (grad2[gi][0] * x0 + grad2[gi][1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      const gi = this.perm[ii + i1 + this.perm[jj + j1]] % 8;
      n1 = t1 * t1 * (grad2[gi][0] * x1 + grad2[gi][1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      const gi = this.perm[ii + 1 + this.perm[jj + 1]] % 8;
      n2 = t2 * t2 * (grad2[gi][0] * x2 + grad2[gi][1] * y2);
    }

    return 70.0 * (n0 + n1 + n2);
  }

  /** Fractal Brownian Motion — layered noise for natural terrain */
  fbm(x: number, y: number, octaves = 4, lacunarity = 2.0, gain = 0.5): number {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let maxAmp = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise2D(x * freq, y * freq) * amp;
      maxAmp += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / maxAmp;
  }
}
