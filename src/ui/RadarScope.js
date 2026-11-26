/**
 * RadarScope: an animated air-defence PPI scope drawn on a canvas.
 * Used behind the hangar and the pause screen. Range rings, bearing scale, a sweeping beam with
 * afterglow, and tracks that only update when the beam crosses them (like a real plot), each with
 * a short data tag. Runs only while its canvas is on screen, at a capped frame rate.
 */
const TAU = Math.PI * 2;

const MINT = '159,240,191';
const SKY = '125,195,240';
const AMBER = '255,178,62';
const RED = '255,107,87';

const TRACKS = [
  // kind: fr friendly, un unknown, hs hostile, ga civil
  { id: 'SHAHEEN 21', kind: 'fr', alt: 240, spd: 460 },
  { id: 'SHAHEEN 22', kind: 'fr', alt: 240, spd: 460, follow: 0 },
  { id: 'THUNDER 07', kind: 'fr', alt: 310, spd: 520 },
  { id: 'UNKNOWN', kind: 'un', alt: 180, spd: 410 },
  { id: 'PK 305', kind: 'ga', alt: 360, spd: 440 },
  { id: 'PK 782', kind: 'ga', alt: 330, spd: 450 },
  { id: 'GA 4471', kind: 'ga', alt: 55, spd: 120 },
  { id: 'BANDIT', kind: 'hs', alt: 90, spd: 500 },
  { id: 'FALCON 3', kind: 'fr', alt: 150, spd: 380 },
];

export class RadarScope {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{cx?:number, cy?:number, strength?:number, fps?:number, maxDpr?:number, label?:string}} [opts]
   *   cx, cy: scope centre as a fraction of the canvas; strength: overall opacity (0..1)
   */
  constructor(canvas, opts = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.cx = opts.cx ?? 0.66;
    this.cy = opts.cy ?? 0.5;
    this.strength = opts.strength ?? 1;
    this.fps = opts.fps ?? 30;
    this.maxDpr = opts.maxDpr ?? 1.25;
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.sweep = Math.random() * TAU;
    this.prevSweep = this.sweep;
    this.rpm = this.reduced ? 3 : 8;          // revolutions per minute
    this.t = 0;
    this.last = 0;
    this.raf = 0;
    this.running = false;
    this.visible = true;
    this.w = 0; this.h = 0; this.dpr = 1;
    this.tracks = TRACKS.map((d, i) => this._spawn(d, i));
    // the second Shaheen flies in formation with the first
    this.tracks[1].r = this.tracks[0].r + 0.03; this.tracks[1].b = this.tracks[0].b + 0.04;
    this.tracks[1].hdg = this.tracks[0].hdg;
    this._tick = this._tick.bind(this);
    this._onResize = () => this.resize();
    addEventListener('resize', this._onResize);
    if (typeof IntersectionObserver === 'function') {
      this.io = new IntersectionObserver((es) => {
        const on = es.some((e) => e.isIntersecting);
        this.visible = on;
        if (on) this.start(); else this.stop();
      });
      this.io.observe(canvas);
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); else if (this.visible) this.start(); });
    this.resize();
  }

  _spawn(d, i) {
    const r = 0.22 + Math.random() * 0.7, b = Math.random() * TAU;
    return {
      ...d, r, b, hdg: Math.random() * TAU,
      x: Math.sin(b) * r, y: -Math.cos(b) * r,
      seenX: 0, seenY: 0, seenAt: -99, trail: [],
      turn: (Math.random() - 0.5) * 0.05, i,
    };
  }

  resize() {
    const dpr = Math.min(this.maxDpr, window.devicePixelRatio || 1);
    const w = this.cv.clientWidth, h = this.cv.clientHeight;
    if (!w || !h) return;
    this.dpr = dpr; this.w = w; this.h = h;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.resize();
    this.raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  _tick(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this._tick);
    const step = 1000 / this.fps;
    if (now - this.last < step - 2) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.update(dt);
    this.draw();
  }

  update(dt) {
    this.prevSweep = this.sweep;
    this.sweep = (this.sweep + (this.rpm / 60) * TAU * dt) % TAU;
    for (const k of this.tracks) {
      // 1 radius unit = 120 nm, so a 450 kt jet crosses the scope in about 16 min: slow it down for show
      const v = (k.spd / 3600 / 120) * 14;
      k.hdg += k.turn * dt;
      k.x += Math.sin(k.hdg) * v * dt * 60;
      k.y -= Math.cos(k.hdg) * v * dt * 60;
      if (k.follow !== undefined) { k.hdg = this.tracks[k.follow].hdg; }
      const rr = Math.hypot(k.x, k.y);
      if (rr > 1.08) {               // left the scope: re-enter on the far side
        const a = Math.atan2(k.x, -k.y) + Math.PI + (Math.random() - 0.5);
        const r = 0.97;
        k.x = Math.sin(a) * r; k.y = -Math.cos(a) * r;
        k.hdg = Math.atan2(-k.x, k.y) + (Math.random() - 0.5) * 0.9;   // head back inward
        k.trail.length = 0;
        if (k.follow === undefined && k.i === 0) { const f = this.tracks[1]; f.x = k.x + 0.03; f.y = k.y + 0.03; f.trail.length = 0; }
      }
      // the beam updates the plot when it crosses the target
      const bearing = (Math.atan2(k.x, -k.y) + TAU) % TAU;
      if (this._crossed(bearing)) {
        if (k.seenAt > -90) { k.trail.push({ x: k.seenX, y: k.seenY }); if (k.trail.length > 3) k.trail.shift(); }
        k.seenX = k.x; k.seenY = k.y; k.seenAt = this.t;
      }
    }
  }

  _crossed(b) {
    const a0 = this.prevSweep, a1 = this.sweep;
    return a0 <= a1 ? (b >= a0 && b < a1) : (b >= a0 || b < a1);
  }

  draw() {
    const { ctx, w, h } = this;
    if (!w) return;
    const S = this.strength;
    ctx.clearRect(0, 0, w, h);
    const R = Math.min(h * 0.5, w * 0.36);
    const cx = w * this.cx, cy = h * this.cy;
    ctx.save();
    ctx.translate(cx, cy);

    // disc
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, `rgba(3,22,12,${0.16 * S})`);
    g.addColorStop(1, `rgba(2,12,7,${0.34 * S})`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();

    // range rings
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      ctx.strokeStyle = `rgba(${MINT},${(i === 4 ? 0.5 : 0.17) * S})`;
      ctx.beginPath(); ctx.arc(0, 0, (R * i) / 4, 0, TAU); ctx.stroke();
    }
    // spokes every 30 degrees; cardinal ones brighter
    for (let a = 0; a < 360; a += 30) {
      const r = (a * Math.PI) / 180;
      ctx.strokeStyle = `rgba(${MINT},${(a % 90 === 0 ? 0.22 : 0.09) * S})`;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(r) * R, -Math.cos(r) * R); ctx.stroke();
    }
    // bearing scale on the outer ring
    ctx.strokeStyle = `rgba(${MINT},${0.55 * S})`;
    for (let a = 0; a < 360; a += 5) {
      const r = (a * Math.PI) / 180, len = a % 30 === 0 ? 11 : a % 10 === 0 ? 7 : 4;
      const s = Math.sin(r), c = -Math.cos(r);
      ctx.beginPath(); ctx.moveTo(s * R, c * R); ctx.lineTo(s * (R - len), c * (R - len)); ctx.stroke();
    }
    ctx.fillStyle = `rgba(${MINT},${0.7 * S})`;
    ctx.font = '600 11px "SW Cond", Roboto, "Arial Narrow", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let a = 0; a < 360; a += 30) {
      const r = (a * Math.PI) / 180, rr = R + 15;
      ctx.fillText(String(a).padStart(3, '0'), Math.sin(r) * rr, -Math.cos(r) * rr);
    }
    // range labels along one spoke
    ctx.textAlign = 'left';
    ctx.fillStyle = `rgba(${MINT},${0.55 * S})`;
    for (let i = 1; i <= 4; i++) ctx.fillText(`${i * 30} NM`, 4 + (R * i) / 4 * 0.7071, -(R * i) / 4 * 0.7071 - 7);

    // two airways
    ctx.save();
    ctx.setLineDash([2, 7]);
    ctx.strokeStyle = `rgba(${SKY},${0.28 * S})`;
    ctx.beginPath(); ctx.moveTo(-R * 0.9, R * 0.35); ctx.lineTo(R * 0.9, -R * 0.45); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-R * 0.3, -R * 0.95); ctx.lineTo(R * 0.4, R * 0.9); ctx.stroke();
    ctx.restore();

    // beam afterglow, then the beam itself
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.clip();
    const steps = 26, span = 1.05;
    for (let i = 0; i < steps; i++) {
      const a1 = this.sweep - (span * i) / steps, a0 = this.sweep - (span * (i + 1)) / steps;
      const al = Math.pow(1 - i / steps, 2) * 0.24 * S;
      ctx.fillStyle = `rgba(${MINT},${al})`;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, a0 - Math.PI / 2, a1 - Math.PI / 2); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = `rgba(${MINT},${0.9 * S})`;
    ctx.lineWidth = 1.6;
    if (!this.reduced) { ctx.shadowColor = `rgba(${MINT},0.9)`; ctx.shadowBlur = 10; }
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(this.sweep) * R, -Math.cos(this.sweep) * R); ctx.stroke();
    ctx.shadowBlur = 0;

    // tracks
    for (const k of this.tracks) this._drawTrack(ctx, k, R, S);

    // station marker
    ctx.strokeStyle = `rgba(${MINT},${0.95 * S})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  _drawTrack(ctx, k, R, S) {
    const age = this.t - k.seenAt;
    const a = Math.exp(-age / 3.4);
    if (a < 0.04) return;
    const col = k.kind === 'fr' ? SKY : k.kind === 'un' ? AMBER : k.kind === 'hs' ? RED : MINT;
    for (let i = 0; i < k.trail.length; i++) {
      const p = k.trail[i];
      ctx.fillStyle = `rgba(${col},${a * 0.35 * S * (i + 1) / 4})`;
      ctx.fillRect(p.x * R - 1, p.y * R - 1, 2, 2);
    }
    const x = k.seenX * R, y = k.seenY * R;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = `rgba(${col},${a * S})`;
    ctx.fillStyle = `rgba(${col},${a * 0.28 * S})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (k.kind === 'fr') { ctx.moveTo(0, -6); ctx.lineTo(6, 5); ctx.lineTo(-6, 5); ctx.closePath(); }
    else if (k.kind === 'un') { ctx.rect(-5, -5, 10, 10); }
    else if (k.kind === 'hs') { ctx.moveTo(0, -7); ctx.lineTo(7, 0); ctx.lineTo(0, 7); ctx.lineTo(-7, 0); ctx.closePath(); }
    else { ctx.arc(0, 0, 3, 0, TAU); }
    ctx.fill(); ctx.stroke();
    // velocity vector
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(k.hdg) * 16, -Math.cos(k.hdg) * 16); ctx.stroke();
    // data tag
    if (a > 0.3) {
      const tx = (x > R * 0.45 ? -12 : 12) * (k.follow !== undefined ? -1 : 1);
      ctx.strokeStyle = `rgba(${col},${a * 0.5 * S})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(tx > 0 ? 7 : -7, -4); ctx.lineTo(tx, -14); ctx.stroke();
      ctx.fillStyle = `rgba(${col},${Math.min(1, a * 1.3) * S})`;
      ctx.font = '600 11px "SW Cond", Roboto, "Arial Narrow", sans-serif';
      ctx.textAlign = tx > 0 ? 'left' : 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(k.id, tx + (tx > 0 ? 2 : -2), -16);
      ctx.font = '500 10px "SW Cond", Roboto, "Arial Narrow", sans-serif';
      ctx.fillText(`FL${String(k.alt).padStart(3, '0')}  ${k.spd}KT`, tx + (tx > 0 ? 2 : -2), -5);
    }
    ctx.restore();
  }

  destroy() {
    this.stop();
    removeEventListener('resize', this._onResize);
    if (this.io) this.io.disconnect();
  }
}
