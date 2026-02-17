import type { BotData, Projectile, Pickup, Trap, BotState, EnemyState, ArenaState, GameEvent, ArenaConfig } from './types';
import {
  ARENA_SIZE, ARENA_HALF, BOT_HP, BOT_ENERGY, BOT_FOV, DEFAULT_OBSTACLES,
  MAX_PICKUPS, PICKUP_INTERVAL, PICKUP_RADIUS,
  HEALTH_PICKUP_AMOUNT, ENERGY_PICKUP_AMOUNT,
  TRAP_RADIUS, TRAP_DAMAGE, TRAP_SLOW_DURATION,
  MAX_TICKS,
} from '../utils/constants';
import { distance, angle, vec2, hasLineOfSight, isInFieldOfView } from '../utils/math';
import type { Vec2 } from '../utils/math';

export class GameState {
  bots: BotData[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  traps: Trap[] = [];
  tick = 0;
  events: GameEvent[] = [];
  gameOver = false;
  winner: number | null = null;
  arenaConfig: ArenaConfig | null = null;
  lastKnownEnemyPos: [Vec2, Vec2] = [vec2(0, 0), vec2(0, 0)];
  enemyVisible: [boolean, boolean] = [true, true];
  private nextProjectileId = 0;
  private nextPickupId = 0;
  private nextTrapId = 0;

  init(bot1Name: string, bot2Name: string) {
    const spawn1 = this.arenaConfig?.spawnPoints[0] ?? vec2(-10, 0);
    const spawn2 = this.arenaConfig?.spawnPoints[1] ?? vec2(10, 0);
    this.bots = [
      this.createBot(0, bot1Name, spawn1),
      this.createBot(1, bot2Name, spawn2),
    ];
    this.projectiles = [];
    this.pickups = [];
    this.traps = [];
    this.tick = 0;
    this.events = [];
    this.gameOver = false;
    this.winner = null;
    this.nextProjectileId = 0;
    this.nextPickupId = 0;
    this.nextTrapId = 0;
    this.lastKnownEnemyPos = [{ ...spawn2 }, { ...spawn1 }];
    this.enemyVisible = [true, true];
  }

  private createBot(id: number, name: string, pos: { x: number; y: number }): BotData {
    return {
      id,
      name,
      hp: BOT_HP,
      energy: BOT_ENERGY,
      position: { ...pos },
      facing: { x: id === 0 ? 1 : -1, y: 0 },
      velocity: { x: 0, y: 0 },
      cooldowns: { melee: 0, ranged: 0, special: 0, dash: 0, heal: 0, trap: 0 },
      status: { burning: 0, slowed: 0, shielded: false, attackCommit: 0 },
      lastCombatTick: 0,
      momentum: 0,
      isDefending: false,
      lastAction: null,
      damageDealt: 0,
      damageTaken: 0,
      actionsUsed: {},
    };
  }

  getBotState(botId: number): BotState {
    const bot = this.bots[botId];
    return {
      hp: bot.hp,
      energy: bot.energy,
      position: { ...bot.position },
      facing: { ...bot.facing },
      cooldowns: { ...bot.cooldowns },
      status: { ...bot.status },
      tickCount: this.tick,
    };
  }

  getEnemyStates(botId: number): EnemyState[] {
    return this.bots
      .filter(b => b.id !== botId)
      .map(enemy => {
        const visible = this.enemyVisible[botId];
        const reportedPos = visible
          ? { ...enemy.position }
          : { ...this.lastKnownEnemyPos[botId] };
        return {
          hp: enemy.hp,
          position: reportedPos,
          distance: distance(this.bots[botId].position, reportedPos),
          angle: angle(this.bots[botId].position, reportedPos),
          isDefending: enemy.isDefending,
          visible,
          status: { ...enemy.status },
        };
      });
  }

  updateVisibility() {
    const obstacles: Array<{ position: Vec2; radius: number }> = this.arenaConfig
      ? this.arenaConfig.obstacles.map(o => ({ position: o.position, radius: o.radius }))
      : DEFAULT_OBSTACLES.map(o => ({ position: vec2(o.x, o.y), radius: o.radius }));

    for (let botId = 0; botId < 2; botId++) {
      const enemyId = 1 - botId;
      const canSee = hasLineOfSight(
        this.bots[botId].position,
        this.bots[enemyId].position,
        obstacles,
      ) && isInFieldOfView(
        this.bots[botId].facing,
        this.bots[botId].position,
        this.bots[enemyId].position,
        BOT_FOV,
      );
      this.enemyVisible[botId] = canSee;
      if (canSee) {
        this.lastKnownEnemyPos[botId] = { ...this.bots[enemyId].position };
      }
    }
  }

  getArenaState(): ArenaState {
    const obstacles = this.arenaConfig
      ? this.arenaConfig.obstacles.map(o => ({ position: { ...o.position }, radius: o.radius }))
      : DEFAULT_OBSTACLES.map(o => ({ position: { x: o.x, y: o.y }, radius: o.radius }));

    return {
      bounds: { width: ARENA_SIZE, height: ARENA_SIZE },
      obstacles,
      pickups: this.pickups
        .filter(p => p.active)
        .map(p => ({
          position: { ...p.position },
          type: p.type,
        })),
      traps: this.traps
        .filter(t => t.active)
        .map(t => ({
          position: { ...t.position },
          ownerId: t.ownerId,
        })),
      tickCount: this.tick,
      maxTicks: MAX_TICKS,
    };
  }

  addProjectile(ownerId: number, pos: { x: number; y: number }, vel: { x: number; y: number }, damage: number) {
    this.projectiles.push({
      id: this.nextProjectileId++,
      ownerId,
      position: { ...pos },
      velocity: { ...vel },
      damage,
      lifetime: 60,
    });
  }

  trySpawnPickup() {
    if (this.tick % PICKUP_INTERVAL !== 0 || this.tick === 0) return;
    const activePickups = this.pickups.filter(p => p.active).length;
    if (activePickups >= MAX_PICKUPS) return;

    const type = Math.random() > 0.5 ? 'health' : 'energy';
    const pos = {
      x: (Math.random() - 0.5) * (ARENA_SIZE - 6),
      y: (Math.random() - 0.5) * (ARENA_SIZE - 6),
    };

    // Don't spawn on obstacles
    const obstacles = this.arenaConfig
      ? this.arenaConfig.obstacles.map(o => ({ x: o.position.x, y: o.position.y, radius: o.radius }))
      : DEFAULT_OBSTACLES;
    for (const obs of obstacles) {
      if (distance(pos, { x: obs.x, y: obs.y }) < obs.radius + 2) return;
    }

    this.pickups.push({
      id: this.nextPickupId++,
      position: pos,
      type,
      active: true,
    });
  }

  checkPickups() {
    for (const pickup of this.pickups) {
      if (!pickup.active) continue;
      for (const bot of this.bots) {
        if (distance(bot.position, pickup.position) < PICKUP_RADIUS + 1.0) {
          pickup.active = false;
          if (pickup.type === 'health') {
            bot.hp = Math.min(BOT_HP, bot.hp + HEALTH_PICKUP_AMOUNT);
          } else {
            bot.energy = Math.min(BOT_ENERGY, bot.energy + ENERGY_PICKUP_AMOUNT);
          }
          this.events.push({
            type: 'pickup',
            target: bot.id,
            position: { ...pickup.position },
            text: `${bot.name} picked up ${pickup.type}!`,
          });
        }
      }
    }
  }

  addTrap(ownerId: number, pos: { x: number; y: number }) {
    this.traps.push({
      id: this.nextTrapId++,
      ownerId,
      position: { ...pos },
      lifetime: 0,
      active: true,
    });
  }

  checkTraps() {
    for (const trap of this.traps) {
      if (!trap.active) continue;
      trap.lifetime++;

      for (const bot of this.bots) {
        if (bot.id === trap.ownerId) continue;
        if (distance(bot.position, trap.position) < TRAP_RADIUS + 1.0) {
          trap.active = false;
          let dmg = TRAP_DAMAGE;
          bot.hp -= dmg;
          bot.damageTaken += dmg;
          bot.status.slowed = TRAP_SLOW_DURATION;
          bot.lastCombatTick = this.tick;
          const owner = this.bots.find(b => b.id === trap.ownerId);
          if (owner) {
            owner.damageDealt += dmg;
            owner.lastCombatTick = this.tick;
          }
          this.events.push({
            type: 'trap_trigger',
            attacker: trap.ownerId,
            target: bot.id,
            damage: dmg,
            position: { ...trap.position },
            text: `${bot.name} triggered a trap! -${dmg} + slowed!`,
          });
        }
      }
    }
  }

  clearEvents() {
    this.events = [];
  }
}
