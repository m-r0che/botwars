import * as THREE from 'three';
import type { Projectile } from '../engine/types';
import { P1_COLOR, P2_COLOR } from '../utils/constants';

interface ProjectileMesh {
  id: number;
  mesh: THREE.Mesh;
  trail: THREE.Line;
  trailPositions: THREE.Vector3[];
}

export class ProjectileRenderer {
  private scene: THREE.Scene;
  private projectiles: Map<number, ProjectileMesh> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  update(projectileStates: Projectile[]) {
    const activeIds = new Set(projectileStates.map(p => p.id));

    // Remove old
    for (const [id, pm] of this.projectiles) {
      if (!activeIds.has(id)) {
        this.scene.remove(pm.mesh);
        this.scene.remove(pm.trail);
        pm.mesh.geometry.dispose();
        (pm.mesh.material as THREE.Material).dispose();
        pm.trail.geometry.dispose();
        (pm.trail.material as THREE.Material).dispose();
        this.projectiles.delete(id);
      }
    }

    // Update or create
    for (const state of projectileStates) {
      let pm = this.projectiles.get(state.id);

      if (!pm) {
        const color = state.ownerId === 0 ? P1_COLOR : P2_COLOR;
        const geo = new THREE.SphereGeometry(0.2, 8, 8);
        const mat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.9,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(state.position.x, 1, state.position.y);

        // Trail
        const trailPositions = [
          new THREE.Vector3(state.position.x, 1, state.position.y),
          new THREE.Vector3(state.position.x, 1, state.position.y),
        ];
        const trailGeo = new THREE.BufferGeometry().setFromPoints(trailPositions);
        const trailMat = new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0.5,
        });
        const trail = new THREE.Line(trailGeo, trailMat);

        this.scene.add(mesh);
        this.scene.add(trail);

        pm = { id: state.id, mesh, trail, trailPositions };
        this.projectiles.set(state.id, pm);
      }

      pm.mesh.position.set(state.position.x, 1, state.position.y);

      // Update trail
      pm.trailPositions.push(new THREE.Vector3(state.position.x, 1, state.position.y));
      if (pm.trailPositions.length > 6) pm.trailPositions.shift();
      pm.trail.geometry.dispose();
      pm.trail.geometry = new THREE.BufferGeometry().setFromPoints(pm.trailPositions);
    }
  }

  clear() {
    for (const [, pm] of this.projectiles) {
      this.scene.remove(pm.mesh);
      this.scene.remove(pm.trail);
      pm.mesh.geometry.dispose();
      (pm.mesh.material as THREE.Material).dispose();
      pm.trail.geometry.dispose();
      (pm.trail.material as THREE.Material).dispose();
    }
    this.projectiles.clear();
  }
}
