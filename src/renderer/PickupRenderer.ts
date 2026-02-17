import * as THREE from 'three';
import type { Pickup } from '../engine/types';

interface PickupMesh {
  id: number;
  mesh: THREE.Mesh;
  glow: THREE.Mesh;
}

export class PickupRenderer {
  private scene: THREE.Scene;
  private pickups: Map<number, PickupMesh> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  update(pickupStates: Pickup[], time: number) {
    const activeIds = new Set(pickupStates.filter(p => p.active).map(p => p.id));

    // Remove old
    for (const [id, pm] of this.pickups) {
      if (!activeIds.has(id)) {
        this.scene.remove(pm.mesh);
        this.scene.remove(pm.glow);
        this.pickups.delete(id);
      }
    }

    // Update or create
    for (const state of pickupStates) {
      if (!state.active) continue;

      let pm = this.pickups.get(state.id);

      if (!pm) {
        const isHealth = state.type === 'health';
        const color = isHealth ? 0x4caf50 : 0x00fff5;

        const geo = isHealth
          ? new THREE.OctahedronGeometry(0.4, 0)
          : new THREE.TetrahedronGeometry(0.4, 0);

        const mat = new THREE.MeshToonMaterial({
          color,
          emissive: new THREE.Color(color),
          emissiveIntensity: 0.5,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(state.position.x, 1, state.position.y);

        const glowGeo = new THREE.SphereGeometry(0.6, 8, 8);
        const glowMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.15,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.copy(mesh.position);

        this.scene.add(mesh);
        this.scene.add(glow);

        pm = { id: state.id, mesh, glow };
        this.pickups.set(state.id, pm);
      }

      // Animate spin + bob
      pm.mesh.rotation.y = time * 3;
      pm.mesh.rotation.x = Math.sin(time * 2) * 0.2;
      pm.mesh.position.y = 1 + Math.sin(time * 4 + state.id) * 0.2;
      pm.glow.position.y = pm.mesh.position.y;
      const glowMat = pm.glow.material as THREE.MeshBasicMaterial;
      glowMat.opacity = 0.1 + Math.sin(time * 5) * 0.05;
    }
  }

  clear() {
    for (const [, pm] of this.pickups) {
      this.scene.remove(pm.mesh);
      this.scene.remove(pm.glow);
    }
    this.pickups.clear();
  }
}
