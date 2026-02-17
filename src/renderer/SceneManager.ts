import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { BiomeType } from '../engine/types';
import { BIOME_PALETTES } from '../utils/constants';

const CRTShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    scanlineIntensity: { value: 0.12 },
    distortion: { value: 0.02 },
    chromaticAberration: { value: 0.003 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float scanlineIntensity;
    uniform float distortion;
    uniform float chromaticAberration;
    varying vec2 vUv;

    void main() {
      // Barrel distortion
      vec2 uv = vUv;
      vec2 centered = uv - 0.5;
      float dist = length(centered);
      uv = uv + centered * dist * dist * distortion;

      // Chromatic aberration
      float r = texture2D(tDiffuse, uv + vec2(chromaticAberration, 0.0)).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - vec2(chromaticAberration, 0.0)).b;

      vec3 color = vec3(r, g, b);

      // Scanlines
      float scanline = sin(uv.y * 800.0) * 0.5 + 0.5;
      color *= 1.0 - scanlineIntensity * (1.0 - scanline);

      // Vignette
      float vignette = 1.0 - dist * 1.2;
      color *= clamp(vignette, 0.0, 1.0);

      // Subtle flicker
      color *= 0.98 + 0.02 * sin(time * 8.0);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

// Biome color-grade post-processing shader
const BiomeGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tintColor: { value: new THREE.Vector3(1, 1, 1) },
    tintStrength: { value: 0.0 },
    time: { value: 0 },
    heatHaze: { value: 0.0 },
    frostVignette: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec3 tintColor;
    uniform float tintStrength;
    uniform float time;
    uniform float heatHaze;
    uniform float frostVignette;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;

      // Heat haze distortion (volcanic)
      if (heatHaze > 0.0) {
        uv.y += sin(uv.x * 20.0 + time * 3.0) * heatHaze * 0.003;
        uv.x += sin(uv.y * 15.0 + time * 2.5) * heatHaze * 0.002;
      }

      vec4 texel = texture2D(tDiffuse, uv);
      vec3 color = texel.rgb;

      // Color tint
      color = mix(color, color * tintColor, tintStrength);

      // Frost vignette (ice)
      if (frostVignette > 0.0) {
        vec2 centered = uv - 0.5;
        float dist = length(centered);
        float frost = smoothstep(0.4, 0.8, dist) * frostVignette;
        color = mix(color, vec3(0.7, 0.85, 1.0), frost * 0.3);
      }

      gl_FragColor = vec4(color, texel.a);
    }
  `,
};

export class SceneManager {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  private crtPass: ShaderPass;
  private biomePass: ShaderPass;
  private clock = new THREE.Clock();
  private ambientLight: THREE.AmbientLight;
  private dirLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;

  constructor(canvas: HTMLCanvasElement) {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a1a);
    this.scene.fog = new THREE.FogExp2(0x0a0a1a, 0.012);

    // Camera — isometric-ish view
    this.camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 200);
    this.camera.position.set(0, 35, 28);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lighting
    this.ambientLight = new THREE.AmbientLight(0x404060, 0.8);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.dirLight.position.set(10, 20, 10);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(2048, 2048);
    this.dirLight.shadow.camera.left = -25;
    this.dirLight.shadow.camera.right = 25;
    this.dirLight.shadow.camera.top = 25;
    this.dirLight.shadow.camera.bottom = -25;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 50;
    this.dirLight.shadow.bias = -0.0001;
    this.scene.add(this.dirLight);

    this.fillLight = new THREE.DirectionalLight(0x4466ff, 0.3);
    this.fillLight.position.set(-10, 10, -10);
    this.scene.add(this.fillLight);

    // Post-processing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
      0.4, // strength
      0.3, // radius
      0.85, // threshold
    );
    this.composer.addPass(bloomPass);

    // Biome grade pass (between bloom and CRT)
    this.biomePass = new ShaderPass(BiomeGradeShader);
    this.composer.addPass(this.biomePass);

    this.crtPass = new ShaderPass(CRTShader);
    this.composer.addPass(this.crtPass);

    this.composer.addPass(new OutputPass());

    // Resize
    window.addEventListener('resize', () => this.onResize());
  }

  /** Update scene lighting, fog, and post-processing for a biome */
  setBiome(biome: BiomeType) {
    const palette = BIOME_PALETTES[biome];

    // Background + fog
    this.scene.background = new THREE.Color(palette.background);
    (this.scene.fog as THREE.FogExp2).color.set(palette.fog);

    // Lighting
    this.ambientLight.color.set(palette.ambient);
    this.dirLight.color.set(palette.directional);
    this.fillLight.color.set(new THREE.Color(palette.ambient).multiplyScalar(0.5));

    // Biome post-processing
    const uniforms = this.biomePass.uniforms;
    uniforms.heatHaze.value = 0;
    uniforms.frostVignette.value = 0;
    uniforms.tintStrength.value = 0;

    switch (biome) {
      case 'volcanic':
        uniforms.tintColor.value.set(1.2, 0.9, 0.7);
        uniforms.tintStrength.value = 0.15;
        uniforms.heatHaze.value = 1.0;
        break;
      case 'ice':
        uniforms.tintColor.value.set(0.85, 0.95, 1.15);
        uniforms.tintStrength.value = 0.12;
        uniforms.frostVignette.value = 1.0;
        break;
      case 'cyber':
        // Enhanced CRT for cyber
        this.crtPass.uniforms.scanlineIntensity.value = 0.2;
        this.crtPass.uniforms.chromaticAberration.value = 0.005;
        uniforms.tintColor.value.set(0.9, 1.0, 1.1);
        uniforms.tintStrength.value = 0.08;
        break;
      case 'forest':
        uniforms.tintColor.value.set(0.9, 1.1, 0.85);
        uniforms.tintStrength.value = 0.1;
        break;
      case 'desert':
        uniforms.tintColor.value.set(1.15, 1.05, 0.85);
        uniforms.tintStrength.value = 0.12;
        break;
    }

    // Reset CRT defaults for non-cyber
    if (biome !== 'cyber') {
      this.crtPass.uniforms.scanlineIntensity.value = 0.12;
      this.crtPass.uniforms.chromaticAberration.value = 0.003;
    }
  }

  private onResize() {
    const canvas = this.renderer.domElement;
    const parent = canvas.parentElement;
    if (!parent) return;
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
  }

  render() {
    const time = this.clock.getElapsedTime();
    this.crtPass.uniforms.time.value = time;
    this.biomePass.uniforms.time.value = time;
    this.composer.render();
  }

  getElapsedTime(): number {
    return this.clock.getElapsedTime();
  }
}
