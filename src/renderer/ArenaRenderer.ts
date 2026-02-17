import * as THREE from 'three';
import { ARENA_SIZE, ARENA_HALF, BIOME_PALETTES, TERRAIN_RESOLUTION } from '../utils/constants';
import type { ArenaConfig, BiomeType, ObstacleData } from '../engine/types';

export class ArenaRenderer {
  private group = new THREE.Group();
  private scene: THREE.Scene;
  private ambientParticles: THREE.Points | null = null;
  private particleMaterial: THREE.PointsMaterial | null = null;
  private decorGroup = new THREE.Group();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    scene.add(this.group);
    scene.add(this.decorGroup);
  }

  /** Build or rebuild the arena from an ArenaConfig. Call per match. */
  buildArena(config: ArenaConfig) {
    this.clear();
    const palette = BIOME_PALETTES[config.biome];

    this.buildTerrain(config);
    this.buildWalls(palette);
    this.buildObstacles(config.obstacles, config.biome, palette);
    this.buildDecorations(config.biome, palette, config);
    this.buildAmbientParticles(config.biome, palette);
  }

  private buildTerrain(config: ArenaConfig) {
    const { terrain, biome } = config;
    const palette = BIOME_PALETTES[biome];
    const res = terrain.resolution;

    const geo = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE, res - 1, res - 1);
    geo.rotateX(-Math.PI / 2);

    const positions = geo.attributes.position;
    const colors = new Float32Array(positions.count * 3);

    const baseColor = new THREE.Color(palette.ground);
    const highColor = new THREE.Color(palette.emissive).multiplyScalar(0.3).add(baseColor);

    let maxH = 0;
    for (let i = 0; i < terrain.heightmap.length; i++) {
      if (terrain.heightmap[i] > maxH) maxH = terrain.heightmap[i];
    }

    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const idx = j * res + i;
        const h = terrain.heightmap[idx];
        positions.setY(idx, h);

        // Vertex color: blend ground -> high based on height
        const t = maxH > 0 ? h / maxH : 0;
        const c = baseColor.clone().lerp(highColor, t);
        colors[idx * 3] = c.r;
        colors[idx * 3 + 1] = c.g;
        colors[idx * 3 + 2] = c.b;
      }
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.15,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);

    // Grid lines overlay
    const gridHelper = new THREE.GridHelper(
      ARENA_SIZE, 20,
      new THREE.Color(palette.wall).multiplyScalar(0.15),
      new THREE.Color(palette.wall).multiplyScalar(0.08),
    );
    gridHelper.position.y = 0.02;
    this.group.add(gridHelper);
  }

  private buildWalls(palette: typeof BIOME_PALETTES['cyber']) {
    const wallHeight = 2;
    const wallThickness = 0.3;
    const glowColor = new THREE.Color(palette.wall);

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x112233,
      emissive: glowColor,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.7,
    });

    const sides = [
      { pos: [0, wallHeight / 2, -ARENA_HALF] as const, scale: [ARENA_SIZE, wallHeight, wallThickness] as const },
      { pos: [0, wallHeight / 2, ARENA_HALF] as const, scale: [ARENA_SIZE, wallHeight, wallThickness] as const },
      { pos: [-ARENA_HALF, wallHeight / 2, 0] as const, scale: [wallThickness, wallHeight, ARENA_SIZE] as const },
      { pos: [ARENA_HALF, wallHeight / 2, 0] as const, scale: [wallThickness, wallHeight, ARENA_SIZE] as const },
    ];

    for (const side of sides) {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const wall = new THREE.Mesh(geo, wallMat);
      wall.position.set(side.pos[0], side.pos[1], side.pos[2]);
      wall.scale.set(side.scale[0], side.scale[1], side.scale[2]);
      this.group.add(wall);
    }

    // Glowing edge lines
    const edgeMat = new THREE.LineBasicMaterial({ color: palette.wall });
    const edgePoints = [
      new THREE.Vector3(-ARENA_HALF, wallHeight, -ARENA_HALF),
      new THREE.Vector3(ARENA_HALF, wallHeight, -ARENA_HALF),
      new THREE.Vector3(ARENA_HALF, wallHeight, ARENA_HALF),
      new THREE.Vector3(-ARENA_HALF, wallHeight, ARENA_HALF),
      new THREE.Vector3(-ARENA_HALF, wallHeight, -ARENA_HALF),
    ];
    const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePoints);
    this.group.add(new THREE.Line(edgeGeo, edgeMat));
  }

  private buildObstacles(obstacles: ObstacleData[], biome: BiomeType, palette: typeof BIOME_PALETTES['cyber']) {
    for (const obs of obstacles) {
      const obsGroup = new THREE.Group();
      obsGroup.position.set(obs.position.x, 0, obs.position.y);

      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(palette.ground).multiplyScalar(1.5),
        roughness: 0.6,
        metalness: 0.4,
        emissive: new THREE.Color(palette.emissive),
        emissiveIntensity: 0.15,
      });

      let geo: THREE.BufferGeometry;

      switch (obs.type) {
        case 'pillar':
          geo = new THREE.CylinderGeometry(obs.radius, obs.radius, obs.height, 8);
          break;
        case 'rock': {
          geo = new THREE.DodecahedronGeometry(obs.radius, 1);
          // Displace vertices for organic look
          const pos = geo.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            const y = pos.getY(i);
            if (y < 0) pos.setY(i, y * 0.3); // flatten bottom
            pos.setX(i, pos.getX(i) * (0.8 + Math.random() * 0.4));
            pos.setZ(i, pos.getZ(i) * (0.8 + Math.random() * 0.4));
          }
          geo.computeVertexNormals();
          break;
        }
        case 'wall':
          geo = new THREE.BoxGeometry(obs.radius * 0.5, obs.height, obs.radius * 4);
          break;
        case 'crate':
          geo = new THREE.BoxGeometry(obs.radius * 1.6, obs.height, obs.radius * 1.6);
          break;
        case 'platform': {
          const base = new THREE.BoxGeometry(obs.radius * 2.5, 0.5, obs.radius * 2.5);
          geo = base;
          // Add a ramp
          const rampGeo = new THREE.BoxGeometry(obs.radius * 1.5, 0.15, obs.radius);
          const rampMesh = new THREE.Mesh(rampGeo, mat);
          rampMesh.position.set(obs.radius * 1.5, 0.15, 0);
          rampMesh.rotation.z = -0.2;
          obsGroup.add(rampMesh);
          break;
        }
        default:
          geo = new THREE.CylinderGeometry(obs.radius, obs.radius, obs.height, 8);
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = obs.type === 'rock' ? obs.radius * 0.6 : obs.height / 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      obsGroup.add(mesh);

      // Glowing ring at top
      const ringGeo = new THREE.TorusGeometry(obs.radius + 0.05, 0.04, 6, 16);
      const ringMat = new THREE.MeshBasicMaterial({ color: palette.wall });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = obs.type === 'rock' ? obs.radius * 1.1 : obs.height;
      ring.rotation.x = Math.PI / 2;
      obsGroup.add(ring);

      this.group.add(obsGroup);
    }
  }

  private buildDecorations(biome: BiomeType, palette: typeof BIOME_PALETTES['cyber'], config: ArenaConfig) {
    const count = 40;
    const decorGeo = this.getDecorationGeometry(biome);
    const decorMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.emissive).multiplyScalar(0.5),
      emissive: new THREE.Color(palette.emissive),
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.7,
    });

    const instancedMesh = new THREE.InstancedMesh(decorGeo, decorMat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * (ARENA_SIZE - 4);
      const z = (Math.random() - 0.5) * (ARENA_SIZE - 4);
      const scale = 0.15 + Math.random() * 0.25;

      dummy.position.set(x, scale * 0.5, z);
      dummy.scale.setScalar(scale);
      dummy.rotation.y = Math.random() * Math.PI * 2;
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    this.decorGroup.add(instancedMesh);
  }

  private getDecorationGeometry(biome: BiomeType): THREE.BufferGeometry {
    switch (biome) {
      case 'volcanic': return new THREE.ConeGeometry(0.5, 1.0, 4); // debris
      case 'ice':      return new THREE.OctahedronGeometry(0.5, 0); // crystals
      case 'cyber':    return new THREE.BoxGeometry(0.3, 1.0, 0.3); // data pillars
      case 'forest':   return new THREE.ConeGeometry(0.3, 0.8, 5); // grass tufts
      case 'desert':   return new THREE.DodecahedronGeometry(0.4, 0); // rock scatter
    }
  }

  private buildAmbientParticles(biome: BiomeType, palette: typeof BIOME_PALETTES['cyber']) {
    const count = 200;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * ARENA_SIZE;
      positions[i * 3 + 1] = Math.random() * 8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * ARENA_SIZE;
      sizes[i] = 0.5 + Math.random() * 1.5;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    this.particleMaterial = new THREE.PointsMaterial({
      color: palette.particleColor,
      size: 0.15,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.ambientParticles = new THREE.Points(geo, this.particleMaterial);
    this.group.add(this.ambientParticles);
  }

  /** Animate ambient particles — call each frame */
  update(time: number) {
    if (!this.ambientParticles) return;
    const pos = this.ambientParticles.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i);
      y += 0.01 + Math.sin(time + i) * 0.005;
      if (y > 8) y = 0;
      pos.setY(i, y);
      // Gentle drift
      pos.setX(i, pos.getX(i) + Math.sin(time * 0.5 + i * 0.1) * 0.003);
    }
    pos.needsUpdate = true;
  }

  clear() {
    // Dispose all children in group
    this.group.traverse(child => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });
    while (this.group.children.length > 0) this.group.remove(this.group.children[0]);

    this.decorGroup.traverse(child => {
      if (child instanceof THREE.InstancedMesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });
    while (this.decorGroup.children.length > 0) this.decorGroup.remove(this.decorGroup.children[0]);

    this.ambientParticles = null;
    this.particleMaterial = null;
  }
}
