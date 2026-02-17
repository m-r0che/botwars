import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  active: boolean;
}

export class ParticleSystem {
  private scene: THREE.Scene;
  private pool: Particle[] = [];
  private readonly POOL_SIZE = 300;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const geo = new THREE.SphereGeometry(0.08, 4, 4);
    for (let i = 0; i < this.POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({
        mesh,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
        active: false,
      });
    }
  }

  emit(position: { x: number; y: number }, color: number, count: number = 8) {
    for (let i = 0; i < count; i++) {
      const p = this.pool.find(p => !p.active);
      if (!p) break;

      p.active = true;
      p.life = 0;
      p.maxLife = 15 + Math.random() * 15;
      p.mesh.visible = true;
      p.mesh.position.set(
        position.x + (Math.random() - 0.5) * 0.5,
        1 + Math.random() * 0.5,
        position.y + (Math.random() - 0.5) * 0.5,
      );
      p.velocity.set(
        (Math.random() - 0.5) * 0.3,
        Math.random() * 0.2 + 0.1,
        (Math.random() - 0.5) * 0.3,
      );
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.color.set(color);
      mat.opacity = 1;
    }
  }

  emitExplosion(position: { x: number; y: number }, color: number) {
    this.emit(position, color, 15);
    this.emit(position, 0xffffff, 5);
  }

  /** Emit biome-colored hit particles — mixes attacker color with biome tint */
  emitBiomeHit(position: { x: number; y: number }, attackerColor: number, biomeColor: number) {
    this.emit(position, attackerColor, 6);
    this.emit(position, biomeColor, 4);
  }

  /** Trail particles behind a moving entity */
  emitTrail(position: { x: number; y: number }, color: number) {
    const p = this.pool.find(p => !p.active);
    if (!p) return;

    p.active = true;
    p.life = 0;
    p.maxLife = 10;
    p.mesh.visible = true;
    p.mesh.position.set(position.x, 0.3, position.y);
    p.velocity.set(0, 0.05, 0);
    const mat = p.mesh.material as THREE.MeshBasicMaterial;
    mat.color.set(color);
    mat.opacity = 0.5;
    p.mesh.scale.setScalar(0.5);
  }

  /** Ring burst outward from a point */
  emitRing(position: { x: number; y: number }, color: number, count: number = 12) {
    for (let i = 0; i < count; i++) {
      const p = this.pool.find(p => !p.active);
      if (!p) break;

      const angle = (i / count) * Math.PI * 2;
      const speed = 0.2 + Math.random() * 0.1;

      p.active = true;
      p.life = 0;
      p.maxLife = 20;
      p.mesh.visible = true;
      p.mesh.position.set(position.x, 1, position.y);
      p.velocity.set(
        Math.cos(angle) * speed,
        0.05,
        Math.sin(angle) * speed,
      );
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.color.set(color);
      mat.opacity = 1;
      p.mesh.scale.setScalar(1);
    }
  }

  update() {
    for (const p of this.pool) {
      if (!p.active) continue;

      p.life++;
      p.mesh.position.add(p.velocity);
      p.velocity.y -= 0.008; // gravity
      p.velocity.multiplyScalar(0.95); // friction

      const t = p.life / p.maxLife;
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 1 - t;
      p.mesh.scale.setScalar(1 - t * 0.5);

      if (p.life >= p.maxLife) {
        p.active = false;
        p.mesh.visible = false;
      }
    }
  }

  clear() {
    for (const p of this.pool) {
      p.active = false;
      p.mesh.visible = false;
    }
  }
}
