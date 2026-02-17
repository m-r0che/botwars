import * as THREE from 'three';

const container = () => document.getElementById('damage-numbers')!;

export function spawnDamageNumber(
  worldPos: { x: number; y: number },
  damage: number,
  type: 'damage' | 'heal' | 'special',
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
) {
  const el = document.createElement('div');
  el.className = `damage-number ${type}`;
  el.textContent = type === 'heal' ? `+${damage}` : `-${damage}`;

  // Project 3D position to screen
  const vec = new THREE.Vector3(worldPos.x, 2.5, worldPos.y);
  vec.project(camera);

  const canvas = renderer.domElement;
  const rect = canvas.getBoundingClientRect();
  const x = ((vec.x + 1) / 2) * rect.width + rect.left;
  const y = ((-vec.y + 1) / 2) * rect.height + rect.top;

  el.style.left = `${x}px`;
  el.style.top = `${y}px`;

  container().appendChild(el);

  // Remove after animation
  setTimeout(() => el.remove(), 1000);
}
