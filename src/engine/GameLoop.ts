import { GameState } from './GameState';
import { processAction, processProjectileHits, checkKO } from './Combat';
import { applyMovement, applyFacing, clampToBounds, resolveBotCollision, resolveObstacleCollision, updateProjectiles } from './Physics';
import { TICK_MS, MAX_TICKS, ENERGY_REGEN, TRAP_LIFETIME } from '../utils/constants';
import type { BotAction, GameEvent } from './types';

export type TickCallback = (state: GameState, events: GameEvent[]) => void;
export type GetActionFn = (botId: number, state: GameState) => Promise<BotAction>;

export class GameLoop {
  state: GameState;
  running = false;
  private tickTimer: number | null = null;
  private onTick: TickCallback;
  private getAction: GetActionFn;
  private onGameOver: (state: GameState) => void;

  // Interpolation
  prevPositions: Array<{ x: number; y: number }> = [];
  currPositions: Array<{ x: number; y: number }> = [];
  lastTickTime = 0;

  constructor(
    onTick: TickCallback,
    getAction: GetActionFn,
    onGameOver: (state: GameState) => void,
  ) {
    this.state = new GameState();
    this.onTick = onTick;
    this.getAction = getAction;
    this.onGameOver = onGameOver;
  }

  start(bot1Name: string, bot2Name: string) {
    this.state.init(bot1Name, bot2Name);
    this.running = true;
    this.prevPositions = this.state.bots.map(b => ({ ...b.position }));
    this.currPositions = this.state.bots.map(b => ({ ...b.position }));
    this.lastTickTime = performance.now();
    this.scheduleTick();
  }

  stop() {
    this.running = false;
    if (this.tickTimer !== null) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
  }

  getInterpolationAlpha(): number {
    const elapsed = performance.now() - this.lastTickTime;
    return Math.min(elapsed / TICK_MS, 1);
  }

  private scheduleTick() {
    if (!this.running) return;
    this.tickTimer = window.setTimeout(() => this.tick(), TICK_MS);
  }

  private async tick() {
    if (!this.running) return;

    this.state.clearEvents();
    this.state.tick++;

    // Save previous positions for interpolation
    this.prevPositions = this.state.bots.map(b => ({ ...b.position }));

    // Get actions from bots
    const actions: BotAction[] = [];
    for (let i = 0; i < this.state.bots.length; i++) {
      try {
        const action = await this.getAction(i, this.state);
        actions.push(action);
      } catch {
        actions.push({ move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, action: null });
      }
    }

    // Apply actions
    for (let i = 0; i < this.state.bots.length; i++) {
      const bot = this.state.bots[i];
      const action = actions[i];

      const terrain = this.state.arenaConfig?.terrain;
      if (action.move) applyMovement(bot, action.move, terrain);
      if (action.aim) applyFacing(bot, action.aim);

      processAction(bot, action.action, this.state);
    }

    // Physics resolution
    const dynObstacles = this.state.arenaConfig?.obstacles;
    for (const bot of this.state.bots) {
      resolveObstacleCollision(bot, dynObstacles);
      clampToBounds(bot);
    }
    resolveBotCollision(this.state.bots[0], this.state.bots[1]);

    // Line-of-sight: track visibility transitions, then update
    const prevVisible: [boolean, boolean] = [...this.state.enemyVisible];
    this.state.updateVisibility();
    for (let i = 0; i < 2; i++) {
      if (prevVisible[i] && !this.state.enemyVisible[i]) {
        this.state.events.push({
          type: 'lost_sight',
          attacker: i,
          target: 1 - i,
          text: `${this.state.bots[i].name} lost sight of ${this.state.bots[1 - i].name}!`,
        });
      } else if (!prevVisible[i] && this.state.enemyVisible[i]) {
        this.state.events.push({
          type: 'gained_sight',
          attacker: i,
          target: 1 - i,
          text: `${this.state.bots[i].name} spotted ${this.state.bots[1 - i].name}!`,
        });
      }
    }

    // Projectiles
    this.state.projectiles = updateProjectiles(this.state.projectiles, dynObstacles);
    processProjectileHits(this.state);

    // Pickups
    this.state.trySpawnPickup();
    this.state.checkPickups();

    // Traps
    this.state.checkTraps();
    this.state.traps = this.state.traps.filter(t => t.active && t.lifetime < TRAP_LIFETIME);

    // Save current positions for interpolation
    this.currPositions = this.state.bots.map(b => ({ ...b.position }));
    this.lastTickTime = performance.now();

    // Check win conditions
    checkKO(this.state);

    if (this.state.tick >= MAX_TICKS && !this.state.gameOver) {
      this.state.gameOver = true;
      // Highest HP% wins
      const [a, b] = this.state.bots;
      if (a.hp > b.hp) this.state.winner = a.id;
      else if (b.hp > a.hp) this.state.winner = b.id;
      else this.state.winner = null; // tie
    }

    this.onTick(this.state, this.state.events);

    if (this.state.gameOver) {
      this.running = false;
      this.onGameOver(this.state);
      return;
    }

    this.scheduleTick();
  }
}
