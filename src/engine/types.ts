export interface BotStyle {
  bodyShape: 'dodecahedron' | 'icosahedron' | 'octahedron' | 'tetrahedron' | 'cube';
  bodyScale: { x: number; y: number; z: number };
  accentColor: string;
  eyeSize: 'small' | 'normal' | 'large';
  eyeStyle: 'normal' | 'angry' | 'sleepy' | 'wide';
  pupilColor: string;
  aura: boolean;
  auraColor: string;
  bobSpeed: number;
  bobAmount: number;
  spiky: boolean;
}

export const DEFAULT_STYLE: BotStyle = {
  bodyShape: 'dodecahedron',
  bodyScale: { x: 1, y: 1, z: 1 },
  accentColor: '#333333',
  eyeSize: 'normal',
  eyeStyle: 'normal',
  pupilColor: '#111111',
  aura: false,
  auraColor: '#ffffff',
  bobSpeed: 1,
  bobAmount: 1,
  spiky: false,
};

export interface Vec2 {
  x: number;
  y: number;
}

export interface BotState {
  hp: number;
  energy: number;
  position: Vec2;
  facing: Vec2;
  cooldowns: {
    melee: number;
    ranged: number;
    special: number;
    dash: number;
    heal: number;
    trap: number;
  };
  status: {
    burning: number;
    slowed: number;
    shielded: boolean;
    attackCommit: number;
  };
  tickCount: number;
}

export interface EnemyState {
  hp: number;
  position: Vec2;
  distance: number;
  angle: number;
  isDefending: boolean;
  visible: boolean;
  status: {
    burning: number;
    slowed: number;
    shielded: boolean;
    attackCommit: number;
  };
}

export interface ArenaState {
  bounds: { width: number; height: number };
  obstacles: Array<{ position: Vec2; radius: number }>;
  pickups: Array<{ position: Vec2; type: 'health' | 'energy' }>;
  traps: Array<{ position: Vec2; ownerId: number }>;
  tickCount: number;
  maxTicks: number;
}

export interface BotAction {
  move: Vec2;
  aim: Vec2;
  action: 'melee' | 'ranged' | 'special' | 'defend' | 'dash' | 'heal' | 'trap' | null;
}

export interface BotData {
  id: number;
  name: string;
  hp: number;
  energy: number;
  position: Vec2;
  facing: Vec2;
  velocity: Vec2;
  cooldowns: {
    melee: number;
    ranged: number;
    special: number;
    dash: number;
    heal: number;
    trap: number;
  };
  status: {
    burning: number;
    slowed: number;
    shielded: boolean;
    attackCommit: number;
  };
  lastCombatTick: number;
  momentum: number;
  isDefending: boolean;
  lastAction: BotAction | null;
  damageDealt: number;
  damageTaken: number;
  actionsUsed: Record<string, number>;
}

export interface Projectile {
  id: number;
  ownerId: number;
  position: Vec2;
  velocity: Vec2;
  damage: number;
  lifetime: number;
}

export interface Pickup {
  id: number;
  position: Vec2;
  type: 'health' | 'energy';
  active: boolean;
}

export interface Trap {
  id: number;
  ownerId: number;
  position: Vec2;
  lifetime: number;
  active: boolean;
}

export interface GameEvent {
  type: 'melee_hit' | 'ranged_fire' | 'ranged_hit' | 'special_use' | 'special_hit'
    | 'defend_start' | 'defend_end' | 'pickup' | 'burn_tick' | 'ko' | 'miss'
    | 'dash_use' | 'heal_use' | 'trap_place' | 'trap_trigger'
    | 'lost_sight' | 'gained_sight';
  attacker?: number;
  target?: number;
  damage?: number;
  position?: Vec2;
  text?: string;
}

// --- Biome & Arena Generation ---

export type BiomeType = 'volcanic' | 'ice' | 'cyber' | 'forest' | 'desert';

export interface ObstacleData {
  position: Vec2;
  radius: number;
  type: 'pillar' | 'rock' | 'wall' | 'crate' | 'platform';
  height: number;
  destructible: boolean;
  hp?: number;
}

export interface TerrainData {
  heightmap: Float32Array;
  resolution: number;
  arenaSize: number;
}

export interface ArenaConfig {
  biome: BiomeType;
  obstacles: ObstacleData[];
  terrain: TerrainData;
  spawnPoints: [Vec2, Vec2];
  bounds: { width: number; height: number };
}

// --- Thought Bubbles ---

export interface ThoughtBubble {
  botId: number;
  text: string;
  timestamp: number;
  duration: number;
  provider: 'claude' | 'openai';
}

export type ThoughtTriggerType =
  | 'match_start'
  | 'took_big_damage'
  | 'landed_big_hit'
  | 'low_hp'
  | 'special_attack'
  | 'collected_pickup'
  | 'enemy_defending'
  | 'near_match_end'
  | 'trap_triggered'
  | 'enemy_healed'
  | 'lost_sight'
  | 'gained_sight';

