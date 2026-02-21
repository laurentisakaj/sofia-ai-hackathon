/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:organize-imports
// tslint:disable:ban-malformed-import-paths
// tslint:disable:no-new-decorators

import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { Analyser } from './analyser';

import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { vs as sphereVS } from './sphere-shader';

/**
 * 3D live audio visual.
 */
@customElement('gdm-live-audio-visuals-3d')
export class GdmLiveAudioVisuals3D extends LitElement {
  private inputAnalyser!: Analyser;
  private outputAnalyser!: Analyser;
  private camera!: THREE.PerspectiveCamera;
  private composer!: EffectComposer;
  private sphere!: THREE.Mesh;
  private prevTime = 0;
  private rotation = new THREE.Vector3(0, 0, 0);

  private _outputNode!: AudioNode;

  @property({ type: Object })
  set outputNode(node: AudioNode) {
    if (!node) return;
    this._outputNode = node;
    this.outputAnalyser = new Analyser(this._outputNode);
  }

  get outputNode() {
    return this._outputNode;
  }

  private _inputNode!: AudioNode;

  @property({ type: Object })
  set inputNode(node: AudioNode) {
    if (!node) return;
    this._inputNode = node;
    this.inputAnalyser = new Analyser(this._inputNode);
  }

  get inputNode() {
    return this._inputNode;
  }

  private canvas!: HTMLCanvasElement;

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: absolute;
      inset: 0;
      background: none !important;
      border: none !important;
    }
    canvas {
      width: 100% !important;
      height: 100% !important;
      position: absolute;
      inset: 0;
      background: none !important;
      border: none !important;
      box-shadow: none !important;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
  }

  private init() {
    console.log('Orb: Initializing 3D visuals...');
    const scene = new THREE.Scene();
    scene.background = null;

    const width = Math.max(this.offsetWidth, 192);
    const height = Math.max(this.offsetHeight, 192);

    const camera = new THREE.PerspectiveCamera(
      75,
      width / height,
      0.1,
      1000,
    );
    camera.position.set(0, 0, 4); // Slightly further back for better framing
    this.camera = camera;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2); // Reduced ambient to allow shadows
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0x7c3aed, 80); // Doubled intensity
    pointLight1.position.set(5, 5, 5);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x3b82f6, 60); // Doubled intensity
    pointLight2.position.set(-5, -5, 2);
    scene.add(pointLight2);

    const pointLight3 = new THREE.PointLight(0xffffff, 20); // White top light for gloss
    pointLight3.position.set(0, 10, 0);
    scene.add(pointLight3);

    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      premultipliedAlpha: false // Better for transparent overlays
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);
    renderer.setClearAlpha(0);

    const geometry = new THREE.IcosahedronGeometry(1.3, 12); // Increased radius from 0.8 to 1.3 for better UI presence

    new EXRLoader().load('/piz_compressed.exr', (texture: THREE.Texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      const exrCubeRenderTarget = pmremGenerator.fromEquirectangular(texture);
      sphereMaterial.envMap = exrCubeRenderTarget.texture;
      sphere.visible = true;
    }, undefined, (err) => {
      console.warn('Orb: EXR load failed, rendering fallback:', err);
      sphere.visible = true;
    });

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0x581c87, // Slightly lighter violet
      metalness: 0.95, // Max metallic for best reflection
      roughness: 0.1,  // Glossy
      emissive: 0x2e1065,
      emissiveIntensity: 1.5, // Increased slightly for internal glow
    });

    sphereMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.time = { value: 0 };
      shader.uniforms.inputData = { value: new THREE.Vector4() };
      shader.uniforms.outputData = { value: new THREE.Vector4() };

      sphereMaterial.userData.shader = shader;

      shader.vertexShader = sphereVS;
    };

    const sphere = new THREE.Mesh(geometry, sphereMaterial);
    scene.add(sphere);
    sphere.visible = false;

    this.sphere = sphere;

    const renderPass = new RenderPass(scene, camera);
    renderPass.clearColor = new THREE.Color(0x000000);
    renderPass.clearAlpha = 1.0;
    renderPass.clear = true;

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.6,
      0.4,
      0.85
    );

    // CRITICAL: EffectComposer needs a specifically formatted RenderTarget for alpha
    const renderTarget = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
    });

    const composer = new EffectComposer(renderer, renderTarget);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);

    this.composer = composer;
    renderer.autoClear = false; // Important for alpha post-processing

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(entry.contentRect.width, 1);
        const h = Math.max(entry.contentRect.height, 1);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        composer.setSize(w, h);
      }
    });

    resizeObserver.observe(this);

    // Initial size push
    composer.setSize(width, height);

    this.animation();
  }

  private animation() {
    requestAnimationFrame(() => this.animation());

    if (!this.inputAnalyser || !this.outputAnalyser) return;

    this.inputAnalyser.update();
    this.outputAnalyser.update();

    const t = performance.now();
    const dt = (t - this.prevTime) / (1000 / 60);
    this.prevTime = t;
    const sphereMaterial = this.sphere.material as THREE.MeshStandardMaterial;


    if (sphereMaterial.userData.shader) {
      this.sphere.scale.setScalar(
        1 + (0.2 * this.outputAnalyser.data[1]) / 255,
      );

      const f = 0.001;
      this.rotation.x += (dt * f * 0.5 * this.outputAnalyser.data[1]) / 255;
      this.rotation.z += (dt * f * 0.5 * this.inputAnalyser.data[1]) / 255;
      this.rotation.y += (dt * f * 0.25 * this.inputAnalyser.data[2]) / 255;
      this.rotation.y += (dt * f * 0.25 * this.outputAnalyser.data[2]) / 255;

      const euler = new THREE.Euler(
        this.rotation.x,
        this.rotation.y,
        this.rotation.z,
      );
      const quaternion = new THREE.Quaternion().setFromEuler(euler);
      const vector = new THREE.Vector3(0, 0, 5);
      vector.applyQuaternion(quaternion);
      this.camera.position.copy(vector);
      this.camera.lookAt(this.sphere.position);

      sphereMaterial.userData.shader.uniforms.time.value +=
        (dt * 0.1 * this.outputAnalyser.data[0]) / 255;
      sphereMaterial.userData.shader.uniforms.inputData.value.set(
        (1 * this.inputAnalyser.data[0]) / 255,
        (0.1 * this.inputAnalyser.data[1]) / 255,
        (10 * this.inputAnalyser.data[2]) / 255,
        0,
      );
      sphereMaterial.userData.shader.uniforms.outputData.value.set(
        (2 * this.outputAnalyser.data[0]) / 255,
        (0.1 * this.outputAnalyser.data[1]) / 255,
        (10 * this.outputAnalyser.data[2]) / 255,
        0,
      );
    }

    this.composer.render();
  }

  protected firstUpdated() {
    this.canvas = this.shadowRoot!.querySelector('canvas') as HTMLCanvasElement;
    this.init();
  }

  protected render() {
    return html`<canvas></canvas>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gdm-live-audio-visuals-3d': GdmLiveAudioVisuals3D;
  }
}
