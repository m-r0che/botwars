// Arena
export const ARENA_SIZE = 40;
export const ARENA_HALF = ARENA_SIZE / 2;

// Game
export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE; // 50ms
export const MAX_TICKS = 2400; // 120 seconds

// Bot
export const BOT_HP = 1000;
export const BOT_ENERGY = 100;
export const BOT_RADIUS = 1.0;
export const BOT_SPEED = 0.3; // units per tick
export const ENERGY_REGEN = 1; // per tick
export const BOT_FOV = 160; // degrees — field of view cone

// Combat
export const MELEE_DAMAGE = 9;
export const MELEE_ENERGY = 12;
export const MELEE_COOLDOWN = 10;
export const MELEE_RANGE = 2.0;

export const RANGED_DAMAGE = 8;
export const RANGED_ENERGY = 14;
export const RANGED_COOLDOWN = 15;
export const RANGED_RANGE = 20.0;
export const PROJECTILE_SPEED = 0.8;

export const SPECIAL_DAMAGE = 12;
export const SPECIAL_ENERGY = 40;
export const SPECIAL_COOLDOWN = 50;
export const SPECIAL_RANGE = 8.0;

export const DEFEND_ENERGY_PER_TICK = 3;
export const DEFEND_REDUCTION = 0.35; // takes 35% damage

// Dash
export const DASH_ENERGY = 15;
export const DASH_COOLDOWN = 12;
export const DASH_DISTANCE = 5;

// Heal
export const HEAL_AMOUNT = 15;
export const HEAL_ENERGY = 30;
export const HEAL_COOLDOWN = 40;

// Trap
export const TRAP_DAMAGE = 10;
export const TRAP_ENERGY = 20;
export const TRAP_COOLDOWN = 25;
export const TRAP_RADIUS = 1.5;
export const TRAP_MAX_PER_BOT = 2;
export const TRAP_SLOW_DURATION = 30;
export const TRAP_LIFETIME = 400;

// Attack commitment
export const MELEE_COMMIT_TICKS = 3;
export const SPECIAL_COMMIT_TICKS = 4;
export const COMMIT_SPEED_MULT = 0.15; // 15% speed during commitment

// Out-of-combat regen
export const OOC_REGEN_DELAY = 40; // ticks (2 sec) without combat
export const OOC_REGEN_RATE = 2;   // HP per tick once active

// Momentum
export const MOMENTUM_BUILDUP = 0.12;
export const MOMENTUM_DECAY = 0.5;
export const MOMENTUM_MAX_BONUS = 0.5; // max 50% speed bonus

// Status effects
export const BURN_DAMAGE = 1;
export const BURN_DURATION = 20;

// Pickups
export const PICKUP_INTERVAL = 100; // ticks (5 sec)
export const MAX_PICKUPS = 3;
export const HEALTH_PICKUP_AMOUNT = 20;
export const ENERGY_PICKUP_AMOUNT = 30;
export const PICKUP_RADIUS = 0.8;

// Obstacles (fallback only — ArenaGenerator produces dynamic obstacles)
export const DEFAULT_OBSTACLES = [
  { x: -8, y: 0, radius: 2.0 },
  { x: 8, y: 5, radius: 1.5 },
  { x: 5, y: -8, radius: 1.8 },
];
/** @deprecated Use DEFAULT_OBSTACLES */
export const OBSTACLES = DEFAULT_OBSTACLES;

// Colors
export const P1_COLOR = 0xff6b6b;
export const P2_COLOR = 0x4ecdc4;
export const ENERGY_COLOR = 0x00fff5;
export const ARENA_COLOR = 0x1a1a2e;
export const WALL_COLOR = 0x00fff5;

// Terrain
export const TERRAIN_RESOLUTION = 80;
export const TERRAIN_MAX_HEIGHT = 2.5;
export const TERRAIN_SLOPE_MAX = 0.6; // max walkable slope

// Biome palettes
import type { BiomeType } from '../engine/types';

export interface BiomePalette {
  ground: number;
  wall: number;
  fog: number;
  ambient: number;
  directional: number;
  emissive: number;
  background: number;
  particleColor: number;
}

export const BIOME_PALETTES: Record<BiomeType, BiomePalette> = {
  volcanic: {
    ground: 0x2a1a0a,
    wall: 0xff4400,
    fog: 0x1a0800,
    ambient: 0x804020,
    directional: 0xff8844,
    emissive: 0xff2200,
    background: 0x0a0400,
    particleColor: 0xff6600,
  },
  ice: {
    ground: 0x1a2a3a,
    wall: 0x88ccff,
    fog: 0x0a1a2a,
    ambient: 0x6688aa,
    directional: 0xaaddff,
    emissive: 0x44aaff,
    background: 0x050a14,
    particleColor: 0xccffff,
  },
  cyber: {
    ground: 0x0a0a1e,
    wall: 0x00ffaa,
    fog: 0x050510,
    ambient: 0x404060,
    directional: 0xffffff,
    emissive: 0x00ff88,
    background: 0x020208,
    particleColor: 0x00ffcc,
  },
  forest: {
    ground: 0x1a2a0a,
    wall: 0x44cc44,
    fog: 0x0a1a05,
    ambient: 0x558844,
    directional: 0xccddaa,
    emissive: 0x22aa22,
    background: 0x040a02,
    particleColor: 0xaaff44,
  },
  desert: {
    ground: 0x3a2a1a,
    wall: 0xffaa44,
    fog: 0x1a1408,
    ambient: 0x998866,
    directional: 0xffddaa,
    emissive: 0xcc8833,
    background: 0x0a0804,
    particleColor: 0xffcc88,
  },
};
