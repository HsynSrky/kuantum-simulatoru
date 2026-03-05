export function hashStringToUint32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Complex {
  constructor(re = 0, im = 0) {
    this.re = re;
    this.im = im;
  }
  clone() {
    return new Complex(this.re, this.im);
  }
  static add(a, b) {
    return new Complex(a.re + b.re, a.im + b.im);
  }
  static sub(a, b) {
    return new Complex(a.re - b.re, a.im - b.im);
  }
  static mul(a, b) {
    return new Complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  }
  static scale(a, s) {
    return new Complex(a.re * s, a.im * s);
  }
  static conj(a) {
    return new Complex(a.re, -a.im);
  }
  static abs2(a) {
    return a.re * a.re + a.im * a.im;
  }
  static abs(a) {
    return Math.hypot(a.re, a.im);
  }
}

export class QuantumRegister {
  constructor({ numQubits, rng }) {
    this.numQubits = numQubits;
    this.rng = rng;
    this.state = new Array(1 << numQubits);
    for (let i = 0; i < this.state.length; i++) this.state[i] = new Complex(0, 0);
    this.state[0] = new Complex(1, 0);
  }

  setRng(rng) {
    this.rng = rng;
  }

  resetBasis(bits) {
    const N = 1 << this.numQubits;
    for (let i = 0; i < N; i++) {
      this.state[i].re = 0;
      this.state[i].im = 0;
    }
    const idx = bits & (N - 1);
    this.state[idx].re = 1;
    this.state[idx].im = 0;
  }

  setSingleQubitBasis(qubit, value) {
    const r = this.measure(qubit);
    if (r !== value) this.applyX(qubit);
  }

  renormalize() {
    let s = 0;
    for (const a of this.state) s += Complex.abs2(a);
    if (s <= 0) {
      this.resetBasis(0);
      return;
    }
    const inv = 1 / Math.sqrt(s);
    for (const a of this.state) {
      a.re *= inv;
      a.im *= inv;
    }
  }

  getReduced1Qubit(qubit) {
    const N = 1 << this.numQubits;
    const bit = 1 << qubit;
    let rho00 = 0;
    let rho11 = 0;
    let rho01 = new Complex(0, 0);

    for (let i = 0; i < N; i++) {
      const ai = this.state[i];
      const is1 = (i & bit) !== 0;
      if (is1) rho11 += Complex.abs2(ai);
      else rho00 += Complex.abs2(ai);
    }

    for (let base = 0; base < N; base++) {
      if (base & bit) continue;
      const i0 = base;
      const i1 = base | bit;
      const a0 = this.state[i0];
      const a1 = this.state[i1];
      const term = Complex.mul(a0, Complex.conj(a1));
      rho01 = Complex.add(rho01, term);
    }

    return { rho00, rho11, rho01 };
  }

  applySingleQubitUnitary(qubit, u00, u01, u10, u11) {
    const N = 1 << this.numQubits;
    const bit = 1 << qubit;

    for (let base = 0; base < N; base++) {
      if (base & bit) continue;
      const i0 = base;
      const i1 = base | bit;
      const a0 = this.state[i0].clone();
      const a1 = this.state[i1].clone();

      const b0 = Complex.add(Complex.mul(u00, a0), Complex.mul(u01, a1));
      const b1 = Complex.add(Complex.mul(u10, a0), Complex.mul(u11, a1));

      this.state[i0].re = b0.re;
      this.state[i0].im = b0.im;
      this.state[i1].re = b1.re;
      this.state[i1].im = b1.im;
    }
  }

  applyH(qubit) {
    const s = 1 / Math.sqrt(2);
    this.applySingleQubitUnitary(
      qubit,
      new Complex(s, 0),
      new Complex(s, 0),
      new Complex(s, 0),
      new Complex(-s, 0)
    );
  }

  applyX(qubit) {
    this.applySingleQubitUnitary(
      qubit,
      new Complex(0, 0),
      new Complex(1, 0),
      new Complex(1, 0),
      new Complex(0, 0)
    );
  }

  applyZRotation(qubit, thetaRad) {
    const e0 = new Complex(1, 0);
    const e1 = new Complex(Math.cos(thetaRad), Math.sin(thetaRad));
    this.applySingleQubitUnitary(qubit, e0, new Complex(0, 0), new Complex(0, 0), e1);
  }

  applyCNOT(control, target) {
    if (control === target) return;
    const N = 1 << this.numQubits;
    const cbit = 1 << control;
    const tbit = 1 << target;

    for (let i = 0; i < N; i++) {
      if ((i & cbit) === 0) continue;
      if (i & tbit) continue;
      const j = i | tbit;
      const tmpRe = this.state[i].re;
      const tmpIm = this.state[i].im;
      this.state[i].re = this.state[j].re;
      this.state[i].im = this.state[j].im;
      this.state[j].re = tmpRe;
      this.state[j].im = tmpIm;
    }
  }

  measure(qubit) {
    const { rho00, rho11 } = this.getReduced1Qubit(qubit);
    const r = this.rng();
    const outcome = r < rho00 ? 0 : 1;

    const N = 1 << this.numQubits;
    const bit = 1 << qubit;
    for (let i = 0; i < N; i++) {
      const is1 = (i & bit) !== 0;
      if ((outcome === 1 && !is1) || (outcome === 0 && is1)) {
        this.state[i].re = 0;
        this.state[i].im = 0;
      }
    }
    this.renormalize();
    return outcome;
  }

  applyDephasing(qubit, p) {
    if (p <= 0) return;
    if (this.rng() < p) this.applySingleQubitUnitary(qubit, new Complex(1, 0), new Complex(0, 0), new Complex(0, 0), new Complex(-1, 0));
  }

  applyAmplitudeDamping(qubit, gamma) {
    if (gamma <= 0) return;
    if (gamma >= 1) gamma = 1;

    const { rho11 } = this.getReduced1Qubit(qubit);
    const pJump = gamma * rho11;
    const u = this.rng();

    const N = 1 << this.numQubits;
    const bit = 1 << qubit;

    if (u < pJump) {
      for (let i = 0; i < N; i++) {
        if ((i & bit) === 0) continue;
        const j = i & ~bit;
        this.state[j].re += this.state[i].re;
        this.state[j].im += this.state[i].im;
        this.state[i].re = 0;
        this.state[i].im = 0;
      }
      this.renormalize();
      return;
    }

    const s = Math.sqrt(1 - gamma);
    for (let i = 0; i < N; i++) {
      if (i & bit) {
        this.state[i].re *= s;
        this.state[i].im *= s;
      }
    }
    this.renormalize();
  }
}
