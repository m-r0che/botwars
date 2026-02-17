import type { BiomeType, ArenaConfig, ObstacleData, TerrainData, Vec2 } from '../engine/types';
import { ARENA_SIZE, ARENA_HALF, TERRAIN_RESOLUTION, TERRAIN_MAX_HEIGHT } from '../utils/constants';
import { NoiseGenerator } from './NoiseGenerator';

const BIOMES: BiomeType[] = ['volcanic', 'ice', 'cyber', 'forest', 'desert'];

interface BiomeTerrainParams {
  frequency: number;
  octaves: number;
  heightScale: number;
  lacunarity: number;
  gain: number;
}

const BIOME_TERRAIN: Record<BiomeType, BiomeTerrainParams> = {
  volcanic: { frequency: 0.08, octaves: 5, heightScale: 1.0, lacunarity: 2.2, gain: 0.45 },
  ice:      { frequency: 0.06, octaves: 3, heightScale: 0.7, lacunarity: 2.0, gain: 0.5 },
  cyber:    { frequency: 0.04, octaves: 2, heightScale: 0.3, lacunarity: 2.0, gain: 0.3 },
  forest:   { frequency: 0.07, octaves: 4, heightScale: 0.8, lacunarity: 2.0, gain: 0.5 },
  desert:   { frequency: 0.05, octaves: 3, heightScale: 0.6, lacunarity: 2.5, gain: 0.4 },
};

const BIOME_OBSTACLE_TYPES: Record<BiomeType, ObstacleData['type'][]> = {
  volcanic: ['rock', 'pillar', 'rock'],
  ice:      ['rock', 'pillar', 'wall'],
  cyber:    ['crate', 'platform', 'wall'],
  forest:   ['rock', 'pillar', 'rock'],
  desert:   ['rock', 'wall', 'crate'],
};

export function generateArena(biome?: BiomeType): ArenaConfig {
  const selectedBiome = biome ?? BIOMES[Math.floor(Math.random() * BIOMES.length)];
  const seed = (Math.random() * 2147483647) | 0;
  const noise = new NoiseGenerator(seed);

  const terrain = generateTerrain(noise, selectedBiome);
  const obstacles = generateObstacles(noise, selectedBiome, terrain);
  const spawnPoints = findSpawnPoints(terrain);

  return {
    biome: selectedBiome,
    obstacles,
    terrain,
    spawnPoints,
    bounds: { width: ARENA_SIZE, height: ARENA_SIZE },
  };
}

function generateTerrain(noise: NoiseGenerator, biome: BiomeType): TerrainData {
  const res = TERRAIN_RESOLUTION;
  const heightmap = new Float32Array(res * res);
  const params = BIOME_TERRAIN[biome];
  const size = ARENA_SIZE;

  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      // Map grid cell to world coords
      const wx = (i / (res - 1) - 0.5) * size;
      const wy = (j / (res - 1) - 0.5) * size;

      let h = noise.fbm(
        wx * params.frequency,
        wy * params.frequency,
        params.octaves,
        params.lacunarity,
        params.gain,
      );

      // Biome-specific shaping
      if (biome === 'volcanic') {
        // Crater-like depressions + ridges
        const crater = noise.noise2D(wx * 0.03, wy * 0.03);
        h += Math.abs(crater) * 0.5;
      } else if (biome === 'cyber') {
        // Quantize to stepped platforms
        h = Math.round(h * 4) / 4;
      } else if (biome === 'desert') {
        // Directional dunes
        const dune = Math.sin(wx * 0.15 + noise.noise2D(wx * 0.05, wy * 0.05) * 2);
        h = h * 0.5 + dune * 0.5;
      }

      // Edge falloff — flatten near walls
      const edgeDist = Math.min(
        ARENA_HALF - Math.abs(wx),
        ARENA_HALF - Math.abs(wy),
      );
      const edgeFalloff = Math.min(1, edgeDist / 5);

      // Center flattening — fair combat zone
      const centerDist = Math.sqrt(wx * wx + wy * wy);
      const centerFlatten = Math.min(1, centerDist / 6);

      h *= edgeFalloff * centerFlatten * params.heightScale * TERRAIN_MAX_HEIGHT;
      h = Math.max(0, h); // no negative heights

      heightmap[j * res + i] = h;
    }
  }

  return { heightmap, resolution: res, arenaSize: size };
}

function generateObstacles(noise: NoiseGenerator, biome: BiomeType, terrain: TerrainData): ObstacleData[] {
  const obstacles: ObstacleData[] = [];
  const types = BIOME_OBSTACLE_TYPES[biome];
  const count = 8 + Math.floor(Math.random() * 8); // 8-15

  const spawnExclusion = 5; // no obstacles within 5u of spawn areas
  const minGap = 3.5;

  for (let attempt = 0; attempt < count * 10 && obstacles.length < count; attempt++) {
    const x = (Math.random() - 0.5) * (ARENA_SIZE - 8);
    const y = (Math.random() - 0.5) * (ARENA_SIZE - 8);

    // Spawn exclusion zones (at roughly +-12, 0)
    if (Math.abs(x - (-12)) < spawnExclusion && Math.abs(y) < spawnExclusion) continue;
    if (Math.abs(x - 12) < spawnExclusion && Math.abs(y) < spawnExclusion) continue;

    // Min gap between obstacles
    let tooClose = false;
    for (const existing of obstacles) {
      const dx = existing.position.x - x;
      const dy = existing.position.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < minGap) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    const type = types[Math.floor(Math.random() * types.length)];
    const radius = type === 'wall' ? 0.8 : (1.0 + Math.random() * 1.2);
    const height = type === 'platform' ? 1.0 : (2.0 + Math.random() * 2.0);

    obstacles.push({
      position: { x, y },
      radius,
      type,
      height,
      destructible: type === 'crate',
      hp: type === 'crate' ? 50 : undefined,
    });
  }

  return obstacles;
}

function findSpawnPoints(terrain: TerrainData): [Vec2, Vec2] {
  // Spawn at +-12, 0 baseline, nudge to flattest nearby cell
  const p1 = nudgeToFlat(terrain, -12, 0);
  const p2 = nudgeToFlat(terrain, 12, 0);
  return [p1, p2];
}

function nudgeToFlat(terrain: TerrainData, baseX: number, baseY: number): Vec2 {
  let bestX = baseX;
  let bestY = baseY;
  let bestSlope = Infinity;

  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const x = baseX + dx;
      const y = baseY + dy;
      const slope = sampleTerrainSlope(terrain, x, y);
      if (slope < bestSlope) {
        bestSlope = slope;
        bestX = x;
        bestY = y;
      }
    }
  }

  return { x: bestX, y: bestY };
}

/** Sample terrain height at world position (bilinear interpolation) */
export function sampleTerrainHeight(terrain: TerrainData, wx: number, wy: number): number {
  const { heightmap, resolution: res, arenaSize } = terrain;
  // World -> grid coords
  const gx = ((wx / arenaSize) + 0.5) * (res - 1);
  const gy = ((wy / arenaSize) + 0.5) * (res - 1);

  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;

  const ix0 = Math.max(0, Math.min(res - 1, ix));
  const ix1 = Math.max(0, Math.min(res - 1, ix + 1));
  const iy0 = Math.max(0, Math.min(res - 1, iy));
  const iy1 = Math.max(0, Math.min(res - 1, iy + 1));

  const h00 = heightmap[iy0 * res + ix0];
  const h10 = heightmap[iy0 * res + ix1];
  const h01 = heightmap[iy1 * res + ix0];
  const h11 = heightmap[iy1 * res + ix1];

  return (h00 * (1 - fx) * (1 - fy) +
          h10 * fx * (1 - fy) +
          h01 * (1 - fx) * fy +
          h11 * fx * fy);
}

/** Compute slope magnitude at world position */
export function sampleTerrainSlope(terrain: TerrainData, wx: number, wy: number): number {
  const d = 0.5;
  const hL = sampleTerrainHeight(terrain, wx - d, wy);
  const hR = sampleTerrainHeight(terrain, wx + d, wy);
  const hD = sampleTerrainHeight(terrain, wx, wy - d);
  const hU = sampleTerrainHeight(terrain, wx, wy + d);
  const dx = (hR - hL) / (2 * d);
  const dy = (hU - hD) / (2 * d);
  return Math.sqrt(dx * dx + dy * dy);
}
