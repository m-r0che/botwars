import type { GameState } from '../engine/GameState';
import type { GameEvent, ThoughtTriggerType } from '../engine/types';
import { MAX_TICKS } from '../utils/constants';

export interface BotEvolutionConfig {
  id: number;
  name: string;
  personality: string;
  provider: 'claude' | 'openai';
}

export interface EvolutionCallbacks {
  onCodeUpdate: (botId: number, code: string) => Promise<boolean>;
  onThoughtStart: (botId: number, provider: 'claude' | 'openai') => void;
  onThoughtUpdate: (botId: number, text: string) => void;
  onThoughtComplete: (botId: number, fullText: string, duration: number) => void;
  onThoughtExpire: (botId: number) => void;
}

interface ActiveThought {
  botId: number;
  text: string;
  startTime: number;
  duration: number;
  complete: boolean;
}

interface PendingRequest {
  botId: number;
  controller: AbortController;
}

const MIN_EVOLUTION_INTERVAL = 5000; // 5s between evolution requests per bot
const THOUGHT_DISPLAY_DURATION = 3000;
const LOW_HP_THRESHOLD = 30;
const BIG_DAMAGE_THRESHOLD = 8;
const NEAR_END_TICKS = 400;

const TRIGGER_PRIORITY: ThoughtTriggerType[] = [
  'match_start',
  'near_match_end',
  'took_big_damage',
  'landed_big_hit',
  'low_hp',
  'special_attack',
  'lost_sight',
  'gained_sight',
  'trap_triggered',
  'enemy_healed',
  'collected_pickup',
  'enemy_defending',
];

function buildSituation(trigger: ThoughtTriggerType, state: GameState, botId: number): string {
  const bot = state.bots[botId];
  const enemy = state.bots[1 - botId];
  const dist = Math.sqrt(
    (bot.position.x - enemy.position.x) ** 2 +
    (bot.position.y - enemy.position.y) ** 2,
  );

  const cooldownInfo = `Cooldowns: melee=${bot.cooldowns.melee}, ranged=${bot.cooldowns.ranged}, special=${bot.cooldowns.special}, dash=${bot.cooldowns.dash}, heal=${bot.cooldowns.heal}, trap=${bot.cooldowns.trap}.`;
  const burningInfo = bot.status.burning > 0 ? ` You are BURNING (${bot.status.burning} ticks left).` : '';
  const enemyDefendingInfo = enemy.isDefending ? ` Enemy is DEFENDING.` : '';
  const enemyBurningInfo = enemy.status.burning > 0 ? ` Enemy is BURNING.` : '';

  const base = `HP: ${Math.ceil(bot.hp)}/100, Energy: ${Math.ceil(bot.energy)}/100. Enemy "${enemy.name}" HP: ${Math.ceil(enemy.hp)}/100. Distance: ${dist.toFixed(1)}. ${cooldownInfo}${burningInfo}${enemyDefendingInfo}${enemyBurningInfo} Tick ${state.tick}/${MAX_TICKS}.`;

  const pickupsNearby = state.pickups.filter(p => p.active).length;
  const pickupInfo = pickupsNearby > 0 ? ` ${pickupsNearby} pickup(s) on field.` : '';

  switch (trigger) {
    case 'match_start':
      return `Battle just started! ${base}${pickupInfo} Write your opening strategy.`;
    case 'near_match_end':
      return `Match almost over! ${base}${pickupInfo} Final push — adapt your code!`;
    case 'took_big_damage':
      return `You just took a big hit! ${base}${pickupInfo} Adapt your code to survive.`;
    case 'landed_big_hit':
      return `You landed a massive hit on ${enemy.name}! ${base}${pickupInfo} Press the advantage?`;
    case 'low_hp':
      return `Critically low health! ${base}${pickupInfo} Rewrite for survival!`;
    case 'special_attack':
      return `You used your SPECIAL! ${base}${pickupInfo} What's the follow-up plan?`;
    case 'collected_pickup':
      return `Collected a pickup! ${base}${pickupInfo} Reassess and adapt.`;
    case 'enemy_defending':
      return `${enemy.name} is shielding! ${base}${pickupInfo} Rewrite to break through?`;
    case 'trap_triggered':
      return `An enemy hit your trap! ${base}${pickupInfo} Press the advantage while they're slowed!`;
    case 'enemy_healed':
      return `${enemy.name} just healed! ${base}${pickupInfo} Adapt — they have more HP now.`;
    case 'lost_sight':
      return `You lost sight of ${enemy.name} behind an obstacle! ${base}${pickupInfo} They could be repositioning — adapt your code!`;
    case 'gained_sight':
      return `You spotted ${enemy.name} again! ${base}${pickupInfo} Adjust your strategy now that you can see them.`;
  }
}

export class CodeEvolutionManager {
  private bots: BotEvolutionConfig[] = [];
  private callbacks: EvolutionCallbacks | null = null;
  private getCode: ((botId: number) => string | null) | null = null;
  private activeThoughts: Map<number, ActiveThought> = new Map();
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private lastEvolutionTime: Map<number, number> = new Map();
  private matchStartFired = false;
  private matchActive = false;
  private accumulatedTriggers: Map<number, ThoughtTriggerType[]> = new Map();

  configure(
    bots: BotEvolutionConfig[],
    callbacks: EvolutionCallbacks,
    getCode: (botId: number) => string | null,
  ) {
    this.bots = bots;
    this.callbacks = callbacks;
    this.getCode = getCode;
    this.activeThoughts.clear();
    this.pendingRequests.clear();
    this.lastEvolutionTime.clear();
    this.matchStartFired = false;
    this.matchActive = true;
    this.accumulatedTriggers.clear();
    for (const bot of bots) {
      this.accumulatedTriggers.set(bot.id, []);
    }
  }

  processEvents(state: GameState, events: GameEvent[]) {
    if (!this.matchActive) return;
    const now = performance.now();

    // Match start trigger
    if (!this.matchStartFired && state.tick <= 2) {
      this.matchStartFired = true;
      for (const bot of this.bots) {
        this.accumulatedTriggers.get(bot.id)!.push('match_start');
      }
    }

    // Process events for triggers
    for (const event of events) {
      if ((event.type === 'melee_hit' || event.type === 'ranged_hit' || event.type === 'special_hit')
        && event.damage && event.damage >= BIG_DAMAGE_THRESHOLD && event.target !== undefined) {
        this.accumulatedTriggers.get(event.target)?.push('took_big_damage');
        if (event.attacker !== undefined) {
          this.accumulatedTriggers.get(event.attacker)?.push('landed_big_hit');
        }
      }

      if (event.type === 'special_use' && event.attacker !== undefined) {
        this.accumulatedTriggers.get(event.attacker)?.push('special_attack');
      }

      if (event.type === 'pickup' && event.target !== undefined) {
        this.accumulatedTriggers.get(event.target)?.push('collected_pickup');
      }

      if (event.type === 'trap_trigger' && event.attacker !== undefined) {
        this.accumulatedTriggers.get(event.attacker)?.push('trap_triggered');
      }

      if (event.type === 'heal_use' && event.attacker !== undefined) {
        // Notify the enemy that this bot healed
        const enemyId = 1 - event.attacker;
        this.accumulatedTriggers.get(enemyId)?.push('enemy_healed');
      }

      // Line of sight transitions
      if (event.type === 'lost_sight' && event.attacker !== undefined) {
        this.accumulatedTriggers.get(event.attacker)?.push('lost_sight');
      }
      if (event.type === 'gained_sight' && event.attacker !== undefined) {
        this.accumulatedTriggers.get(event.attacker)?.push('gained_sight');
      }
    }

    // Check persistent conditions
    for (const bot of this.bots) {
      const botData = state.bots[bot.id];
      if (!botData) continue;

      if (botData.hp <= LOW_HP_THRESHOLD) {
        this.accumulatedTriggers.get(bot.id)?.push('low_hp');
      }

      const enemy = state.bots[1 - bot.id];
      if (enemy?.isDefending) {
        this.accumulatedTriggers.get(bot.id)?.push('enemy_defending');
      }

      if (state.tick >= MAX_TICKS - NEAR_END_TICKS) {
        this.accumulatedTriggers.get(bot.id)?.push('near_match_end');
      }
    }

    // Decide which bots should evolve
    for (const bot of this.bots) {
      const triggers = this.accumulatedTriggers.get(bot.id)!;
      if (triggers.length === 0) continue;

      // Rate limiting
      const lastTime = this.lastEvolutionTime.get(bot.id) ?? 0;
      if (now - lastTime < MIN_EVOLUTION_INTERVAL) {
        triggers.length = 0;
        continue;
      }

      // Don't start if already pending
      if (this.pendingRequests.has(bot.id)) {
        triggers.length = 0;
        continue;
      }

      // Pick highest priority trigger
      let bestTrigger: ThoughtTriggerType | null = null;
      let bestPriority = Infinity;
      for (const t of triggers) {
        const idx = TRIGGER_PRIORITY.indexOf(t);
        if (idx >= 0 && idx < bestPriority) {
          bestPriority = idx;
          bestTrigger = t;
        }
      }
      triggers.length = 0;

      if (bestTrigger) {
        this.lastEvolutionTime.set(bot.id, now);
        const situation = buildSituation(bestTrigger, state, bot.id);
        this.requestEvolution(bot, situation);
      }
    }
  }

  private async requestEvolution(bot: BotEvolutionConfig, situation: string) {
    if (!this.matchActive) return;

    const controller = new AbortController();
    this.pendingRequests.set(bot.id, { botId: bot.id, controller });

    const endpoint = bot.provider === 'claude' ? '/api/evolve/claude' : '/api/evolve/openai';
    const currentCode = this.getCode?.(bot.id) ?? '';

    this.callbacks?.onThoughtStart(bot.id, bot.provider);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botName: bot.name,
          personality: bot.personality,
          currentCode,
          situation,
        }),
        signal: controller.signal,
      });

      if (!this.matchActive) return;

      if (!res.ok) {
        this.pendingRequests.delete(bot.id);
        return;
      }

      const data = await res.json();
      const { code, thought } = data;

      if (!this.matchActive) return;

      // Hot-swap code if provided
      if (code) {
        const success = await this.callbacks?.onCodeUpdate(bot.id, code);
        if (success) {
          const provider = bot.provider === 'claude' ? 'CLAUDE' : 'OPENAI';
          console.log(`[${provider}] ${bot.name}'s brain evolved!`);
        }
      }

      // Show thought bubble
      if (thought) {
        this.callbacks?.onThoughtUpdate(bot.id, thought);
        this.activeThoughts.set(bot.id, {
          botId: bot.id,
          text: thought,
          startTime: performance.now(),
          duration: THOUGHT_DISPLAY_DURATION,
          complete: true,
        });
        this.callbacks?.onThoughtComplete(bot.id, thought, THOUGHT_DISPLAY_DURATION);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn(`Evolution request failed for bot ${bot.id}:`, err);
      }
    } finally {
      this.pendingRequests.delete(bot.id);
    }
  }

  /** Call per frame to expire old thoughts */
  update(now: number) {
    for (const [botId, thought] of this.activeThoughts) {
      if (thought.complete && now - thought.startTime > thought.duration) {
        this.activeThoughts.delete(botId);
        this.callbacks?.onThoughtExpire(botId);
      }
    }
  }

  dispose() {
    this.matchActive = false;
    for (const [, req] of this.pendingRequests) {
      req.controller.abort();
    }
    this.pendingRequests.clear();
    this.activeThoughts.clear();
  }
}
