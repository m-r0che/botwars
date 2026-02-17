import * as THREE from 'three';
import type { Trap } from '../engine/types';
import { P1_COLOR, P2_COLOR } from '../utils/constants';

interface TrapMesh {
  id: number;
  mesh: THREE.Mesh;
  glow: THREE.Mesh;
}

export class TrapRenderer {
  private scene: THREE.Scene;
  private traps: Map<number, TrapMesh> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  update(trapStates: Trap[], time: number) {
    const activeIds = new Set(trapStates.filter(t => t.active).map(t => t.id));

    // Remove old
    for (const [id, tm] of this.traps) {
      if (!activeIds.has(id)) {
        this.scene.remove(tm.mesh);
        this.scene.remove(tm.glow);
        tm.mesh.geometry.dispose();
        (tm.mesh.material as THREE.Material).dispose();
        tm.glow.geometry.dispose();
        (tm.glow.material as THREE.Material).dispose();
        this.traps.delete(id);
      }
    }

    // Update or create
    for (const state of trapStates) {
      if (!state.active) continue;

      let tm = this.traps.get(state.id);

      if (!tm) {
        const color = state.ownerId === 0 ? P1_COLOR : P2_COLOR;

        const geo = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 6);
        const mat = new THREE.MeshStandardMaterial({
          color,
          emissive: new THREE.Color(color),
          emissiveIntensity: 0.6,
          metalness: 0.8,
          roughness: 0.2,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(state.position.x, 0.05, state.position.y);

        const glowGeo = new THREE.RingGeometry(0.6, 0.8, 6);
        const glowMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.set(state.position.x, 0.06, state.position.y);
        glow.rotation.x = -Math.PI / 2;

        this.scene.add(mesh);
        this.scene.add(glow);

        tm = { id: state.id, mesh, glow };
        this.traps.set(state.id, tm);
      }

      // Pulse glow
      const glowMat = tm.glow.material as THREE.MeshBasicMaterial;
      glowMat.opacity = 0.2 + Math.sin(time * 6 + state.id) * 0.15;
      const scale = 1.0 + Math.sin(time * 4 + state.id) * 0.1;
      tm.glow.scale.setScalar(scale);
    }
  }

  clear() {
    for (const [, tm] of this.traps) {
      this.scene.remove(tm.mesh);
      this.scene.remove(tm.glow);
      tm.mesh.geometry.dispose();
      (tm.mesh.material as THREE.Material).dispose();
      tm.glow.geometry.dispose();
      (tm.glow.material as THREE.Material).dispose();
    }
    this.traps.clear();
  }
}
