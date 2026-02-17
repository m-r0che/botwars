import type { GameState } from '../engine/GameState';
import type { GameEvent, ThoughtTriggerType } from '../engine/types';
import { MAX_TICKS } from '../utils/constants';

export interface BotThoughtConfig {
  id: number;
  name: string;
  personality: string;
  provider: 'claude' | 'openai';
}

export interface ThoughtCallbacks {
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

const MIN_THOUGHT_INTERVAL = 5000; // 5s between thoughts per bot
const THOUGHT_DISPLAY_DURATION = 4000; // 4s display time
const LOW_HP_THRESHOLD = 30;
const BIG_DAMAGE_THRESHOLD = 8;
const NEAR_END_TICKS = 400; // last 20 seconds

// Priority order for trigger types
const TRIGGER_PRIORITY: ThoughtTriggerType[] = [
  'match_start',
  'near_match_end',
  'took_big_damage',
  'landed_big_hit',
  'low_hp',
  'special_attack',
  'lost_sight',
  'gained_sight',
  'collected_pickup',
  'enemy_defending',
];

function buildSituation(trigger: ThoughtTriggerType, state: GameState, botId: number): string {
  const bot = state.bots[botId];
  const enemy = state.bots[1 - botId];
  const base = `HP: ${Math.ceil(bot.hp)}/100, Energy: ${Math.ceil(bot.energy)}/100. Enemy HP: ${Math.ceil(enemy.hp)}/100. Tick ${state.tick}/${MAX_TICKS}.`;

  switch (trigger) {
    case 'match_start':
      return `The battle just started! ${base} Size up your opponent.`;
    case 'near_match_end':
      return `The match is almost over! ${base} Final moments - what's your strategy?`;
    case 'took_big_damage':
      return `You just took a big hit! ${base} React to the pain.`;
    case 'landed_big_hit':
      return `You just landed a massive hit on ${enemy.name}! ${base} Celebrate or press the advantage.`;
    case 'low_hp':
      return `You're critically low on health! ${base} Desperate times.`;
    case 'special_attack':
      return `You just used your SPECIAL attack! ${base} Comment on your power move.`;
    case 'collected_pickup':
      return `You just collected a pickup! ${base} How does it feel?`;
    case 'enemy_defending':
      return `${enemy.name} is hiding behind their shield! ${base} Taunt them.`;
    case 'trap_triggered':
      return `An enemy hit your trap! ${base} React to the explosion.`;
    case 'enemy_healed':
      return `${enemy.name} just healed! ${base} How annoying.`;
    case 'lost_sight':
      return `You lost sight of ${enemy.name} behind an obstacle! ${base} Where did they go?`;
    case 'gained_sight':
      return `You spotted ${enemy.name} again! ${base} React to finding them.`;
  }
}

export class ThoughtManager {
  private bots: BotThoughtConfig[] = [];
  private callbacks: ThoughtCallbacks | null = null;
  private activeThoughts: Map<number, ActiveThought> = new Map();
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private lastThoughtTime: Map<number, number> = new Map();
  private matchStartFired = false;
  private accumulatedTriggers: Map<number, ThoughtTriggerType[]> = new Map();

  configure(bots: BotThoughtConfig[], callbacks: ThoughtCallbacks) {
    this.bots = bots;
    this.callbacks = callbacks;
    this.activeThoughts.clear();
    this.pendingRequests.clear();
    this.lastThoughtTime.clear();
    this.matchStartFired = false;
    this.accumulatedTriggers.clear();
    for (const bot of bots) {
      this.accumulatedTriggers.set(bot.id, []);
    }
  }

  processEvents(state: GameState, events: GameEvent[]) {
    const now = performance.now();

    // Match start trigger (first tick)
    if (!this.matchStartFired && state.tick <= 2) {
      this.matchStartFired = true;
      for (const bot of this.bots) {
        this.accumulatedTriggers.get(bot.id)!.push('match_start');
      }
    }

    // Process events for triggers
    for (const event of events) {
      // Big damage taken
      if ((event.type === 'melee_hit' || event.type === 'ranged_hit' || event.type === 'special_hit')
        && event.damage && event.damage >= BIG_DAMAGE_THRESHOLD && event.target !== undefined) {
        this.accumulatedTriggers.get(event.target)?.push('took_big_damage');
        if (event.attacker !== undefined) {
          this.accumulatedTriggers.get(event.attacker)?.push('landed_big_hit');
        }
      }

      // Special attack
      if (event.type === 'special_use' && event.attacker !== undefined) {
        this.accumulatedTriggers.get(event.attacker)?.push('special_attack');
      }

      // Pickup
      if (event.type === 'pickup' && event.target !== undefined) {
        this.accumulatedTriggers.get(event.target)?.push('collected_pickup');
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

    // Decide which bots should think
    for (const bot of this.bots) {
      const triggers = this.accumulatedTriggers.get(bot.id)!;
      if (triggers.length === 0) continue;

      // Rate limiting
      const lastTime = this.lastThoughtTime.get(bot.id) ?? 0;
      if (now - lastTime < MIN_THOUGHT_INTERVAL) {
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
        this.lastThoughtTime.set(bot.id, now);
        const situation = buildSituation(bestTrigger, state, bot.id);
        this.requestThought(bot, situation);
      }
    }
  }

  private async requestThought(bot: BotThoughtConfig, situation: string) {
    const controller = new AbortController();
    this.pendingRequests.set(bot.id, { botId: bot.id, controller });

    const endpoint = bot.provider === 'claude' ? '/api/thought/claude' : '/api/thought/openai';

    this.callbacks?.onThoughtStart(bot.id, bot.provider);

    let fullText = '';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botName: bot.name,
          personality: bot.personality,
          situation,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        this.pendingRequests.delete(bot.id);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              fullText += parsed.text;
              this.callbacks?.onThoughtUpdate(bot.id, fullText);
            }
          } catch {
            // Ignore parse errors in stream
          }
        }
      }

      if (fullText) {
        this.activeThoughts.set(bot.id, {
          botId: bot.id,
          text: fullText,
          startTime: performance.now(),
          duration: THOUGHT_DISPLAY_DURATION,
          complete: true,
        });
        this.callbacks?.onThoughtComplete(bot.id, fullText, THOUGHT_DISPLAY_DURATION);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn(`Thought request failed for bot ${bot.id}:`, err);
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
    for (const [, req] of this.pendingRequests) {
      req.controller.abort();
    }
    this.pendingRequests.clear();
    this.activeThoughts.clear();
  }
}
