import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { Analyser } from './analyser';

const TAU = Math.PI * 2;
const PARTICLE_COUNT = 400;

interface Particle {
  theta: number;
  phi: number;
  speed: number;
  size: number;
  hue: number;
  sat: number;
  lit: number;
  brightness: number;
}

@customElement('gdm-live-audio-visuals-canvas')
export class GdmLiveAudioVisualsCanvas extends LitElement {
  private inputAnalyser!: Analyser;
  private outputAnalyser!: Analyser;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private animId = 0;
  private time = 0;
  private rotY = 0;
  private rotX = 0;
  private smoothInput = [0, 0, 0];
  private smoothOutput = [0, 0, 0];

  private _outputNode!: AudioNode;
  @property({ type: Object })
  set outputNode(node: AudioNode) {
    if (!node) return;
    this._outputNode = node;
    this.outputAnalyser = new Analyser(this._outputNode);
  }
  get outputNode() { return this._outputNode; }

  private _inputNode!: AudioNode;
  @property({ type: Object })
  set inputNode(node: AudioNode) {
    if (!node) return;
    this._inputNode = node;
    this.inputAnalyser = new Analyser(this._inputNode);
  }
  get inputNode() { return this._inputNode; }

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: absolute;
      inset: 0;
    }
    canvas {
      width: 100% !important;
      height: 100% !important;
      position: absolute;
      inset: 0;
    }
  `;

  private initParticles() {
    this.particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Fibonacci sphere
      const phi = Math.acos(1 - 2 * (i + 0.5) / PARTICLE_COUNT);
      const theta = TAU * i / ((1 + Math.sqrt(5)) / 2);
      // Site palette: gold (#d97706) = hsl(38,90%,44%), amber warm tones
      const variant = Math.random();
      let hue, sat, lit;
      if (variant < 0.5) {
        // Gold
        hue = 36 + Math.random() * 8;
        sat = 80 + Math.random() * 15;
        lit = 45 + Math.random() * 20;
      } else if (variant < 0.8) {
        // Warm amber/copper
        hue = 25 + Math.random() * 15;
        sat = 70 + Math.random() * 20;
        lit = 40 + Math.random() * 15;
      } else {
        // Cream/white highlight
        hue = 38 + Math.random() * 10;
        sat = 30 + Math.random() * 30;
        lit = 75 + Math.random() * 20;
      }
      this.particles.push({
        theta,
        phi,
        speed: 0.2 + Math.random() * 0.4,
        size: 1.2 + Math.random() * 2,
        hue,
        sat,
        lit,
        brightness: 0.5 + Math.random() * 0.5,
      });
    }
  }

  private init() {
    this.canvas = this.shadowRoot!.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.initParticles();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this);
    this.animate();
  }

  private resize() {
    const w = Math.max(this.offsetWidth, 192);
    const h = Math.max(this.offsetHeight, 192);
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private animate() {
    this.animId = requestAnimationFrame(() => this.animate());

    if (!this.inputAnalyser || !this.outputAnalyser) return;
    this.inputAnalyser.update();
    this.outputAnalyser.update();

    const inD = this.inputAnalyser.data;
    const outD = this.outputAnalyser.data;

    const ease = 0.1;
    for (let i = 0; i < 3; i++) {
      this.smoothInput[i] += ((inD[i] / 255) - this.smoothInput[i]) * ease;
      this.smoothOutput[i] += ((outD[i] / 255) - this.smoothOutput[i]) * ease;
    }

    const dt = 0.016;
    this.time += dt;
    this.rotY += dt * (0.12 + this.smoothOutput[1] * 0.6);
    this.rotX += dt * (0.04 + this.smoothInput[1] * 0.2);

    this.draw();
  }

  private draw() {
    const ctx = this.ctx;
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    const cx = w / 2;
    const cy = h / 2;

    const outE = this.smoothOutput[0];
    const inE = this.smoothInput[0];
    const totalE = (outE + inE) * 0.5;
    const sphereR = Math.min(w, h) * 0.34 * (1 + totalE * 0.18);

    ctx.clearRect(0, 0, w, h);

    // Warm core glow
    const coreR = sphereR * 0.85;
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    coreGrad.addColorStop(0, `hsla(40, 85%, 70%, ${0.3 + totalE * 0.35})`);
    coreGrad.addColorStop(0.3, `hsla(38, 80%, 55%, ${0.15 + totalE * 0.2})`);
    coreGrad.addColorStop(0.6, `hsla(35, 70%, 40%, ${0.06 + totalE * 0.08})`);
    coreGrad.addColorStop(1, 'hsla(30, 60%, 30%, 0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, TAU);
    ctx.fill();

    // Outer golden haze
    const hazeR = sphereR * 1.3;
    const hazeGrad = ctx.createRadialGradient(cx, cy, sphereR * 0.5, cx, cy, hazeR);
    hazeGrad.addColorStop(0, `hsla(38, 60%, 55%, ${0.04 + outE * 0.06})`);
    hazeGrad.addColorStop(1, 'hsla(35, 50%, 40%, 0)');
    ctx.fillStyle = hazeGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, hazeR, 0, TAU);
    ctx.fill();

    // 3D rotation matrices
    const cosRY = Math.cos(this.rotY);
    const sinRY = Math.sin(this.rotY);
    const cosRX = Math.cos(this.rotX);
    const sinRX = Math.sin(this.rotX);

    // Project particles
    const projected: { x: number; y: number; z: number; p: Particle }[] = [];

    for (const p of this.particles) {
      // Audio displacement — organic breathing
      const wave = Math.sin(p.theta * 4 + this.time * 2) * Math.cos(p.phi * 3 + this.time * 1.5);
      const audioDisplace = 1 + wave * totalE * 0.18;
      const r = sphereR * audioDisplace;

      const sinPhi = Math.sin(p.phi);
      const thetaAnimated = p.theta + this.time * p.speed * 0.15;
      let x = r * sinPhi * Math.cos(thetaAnimated);
      let y = r * Math.cos(p.phi);
      let z = r * sinPhi * Math.sin(thetaAnimated);

      // Rotate Y then X
      const x1 = x * cosRY - z * sinRY;
      const z1 = x * sinRY + z * cosRY;
      const y1 = y * cosRX - z1 * sinRX;
      const z2 = y * sinRX + z1 * cosRX;

      projected.push({ x: cx + x1, y: cy + y1, z: z2, p });
    }

    // Z-sort back to front
    projected.sort((a, b) => a.z - b.z);

    // Draw particles
    ctx.globalCompositeOperation = 'lighter';
    for (const { x, y, z, p } of projected) {
      const depthNorm = (z + sphereR) / (2 * sphereR); // 0=back, 1=front
      const alpha = (0.08 + depthNorm * 0.55) * (0.5 + totalE * 0.5) * p.brightness;
      const size = p.size * (0.4 + depthNorm * 1.1) * (1 + totalE * 0.6);
      const lit = p.lit + depthNorm * 15 + totalE * 10;

      // Each particle is a soft radial gradient for a glassy look
      const grad = ctx.createRadialGradient(x, y, 0, x, y, size * 2.5);
      grad.addColorStop(0, `hsla(${p.hue}, ${p.sat}%, ${lit}%, ${alpha})`);
      grad.addColorStop(0.5, `hsla(${p.hue}, ${p.sat - 10}%, ${lit - 8}%, ${alpha * 0.4})`);
      grad.addColorStop(1, `hsla(${p.hue}, ${p.sat - 15}%, ${lit - 15}%, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, size * 2.5, 0, TAU);
      ctx.fill();

      // Bright dot center for front particles
      if (depthNorm > 0.5) {
        ctx.fillStyle = `hsla(${p.hue}, ${p.sat}%, ${Math.min(lit + 20, 95)}%, ${alpha * 0.8})`;
        ctx.beginPath();
        ctx.arc(x, y, size * 0.6, 0, TAU);
        ctx.fill();
      }
    }

    // Connecting filaments between nearby front particles when speaking
    if (totalE > 0.3) {
      const frontParticles = projected.filter(p => p.z > 0);
      const filAlpha = (totalE - 0.3) * 1.5;
      ctx.strokeStyle = `hsla(40, 80%, 65%, ${filAlpha * 0.15})`;
      ctx.lineWidth = 0.5;

      for (let i = 0; i < frontParticles.length; i++) {
        const a = frontParticles[i];
        for (let j = i + 1; j < Math.min(i + 8, frontParticles.length); j++) {
          const b = frontParticles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 30) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
    }

    ctx.globalCompositeOperation = 'source-over';

    // Specular highlight — top-left sheen like a glass sphere
    const specX = cx - sphereR * 0.25;
    const specY = cy - sphereR * 0.25;
    const specR = sphereR * 0.5;
    const specGrad = ctx.createRadialGradient(specX, specY, 0, specX, specY, specR);
    specGrad.addColorStop(0, `hsla(45, 50%, 95%, ${0.08 + totalE * 0.1})`);
    specGrad.addColorStop(0.5, `hsla(42, 40%, 85%, ${0.03 + totalE * 0.04})`);
    specGrad.addColorStop(1, 'hsla(40, 30%, 70%, 0)');
    ctx.fillStyle = specGrad;
    ctx.beginPath();
    ctx.arc(specX, specY, specR, 0, TAU);
    ctx.fill();
  }

  protected firstUpdated() {
    this.init();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    cancelAnimationFrame(this.animId);
  }

  protected render() {
    return html`<canvas></canvas>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gdm-live-audio-visuals-canvas': GdmLiveAudioVisualsCanvas;
  }
}
