import type { BotData, GameEvent } from './types';
import type { GameState } from './GameState';
import {
  MELEE_DAMAGE, MELEE_ENERGY, MELEE_COOLDOWN, MELEE_RANGE,
  RANGED_DAMAGE, RANGED_ENERGY, RANGED_COOLDOWN, PROJECTILE_SPEED,
  SPECIAL_DAMAGE, SPECIAL_ENERGY, SPECIAL_COOLDOWN, SPECIAL_RANGE,
  DEFEND_ENERGY_PER_TICK, DEFEND_REDUCTION,
  BURN_DAMAGE, BURN_DURATION,
  ENERGY_REGEN, BOT_HP,
  DASH_ENERGY, DASH_COOLDOWN, DASH_DISTANCE,
  HEAL_AMOUNT, HEAL_ENERGY, HEAL_COOLDOWN,
  TRAP_ENERGY, TRAP_COOLDOWN, TRAP_MAX_PER_BOT,
  MELEE_COMMIT_TICKS, SPECIAL_COMMIT_TICKS,
  OOC_REGEN_DELAY, OOC_REGEN_RATE,
} from '../utils/constants';
import { distance, normalize, sub, dot, vec2, angle } from '../utils/math';

export function processAction(bot: BotData, action: string | null, state: GameState) {
  // Reset defending
  bot.isDefending = false;
  bot.status.shielded = false;

  // Tick cooldowns
  if (bot.cooldowns.melee > 0) bot.cooldowns.melee--;
  if (bot.cooldowns.ranged > 0) bot.cooldowns.ranged--;
  if (bot.cooldowns.special > 0) bot.cooldowns.special--;
  if (bot.cooldowns.dash > 0) bot.cooldowns.dash--;
  if (bot.cooldowns.heal > 0) bot.cooldowns.heal--;
  if (bot.cooldowns.trap > 0) bot.cooldowns.trap--;

  // Tick down attack commitment
  if (bot.status.attackCommit > 0) bot.status.attackCommit--;

  // Regen energy
  bot.energy = Math.min(100, bot.energy + ENERGY_REGEN);

  // Process status effects
  if (bot.status.burning > 0) {
    bot.status.burning--;
    const dmg = BURN_DAMAGE;
    bot.hp -= dmg;
    bot.damageTaken += dmg;
    bot.lastCombatTick = state.tick;
    state.events.push({
      type: 'burn_tick',
      target: bot.id,
      damage: dmg,
      position: { ...bot.position },
      text: `${bot.name} is burning! -${dmg}`,
    });
  }
  if (bot.status.slowed > 0) bot.status.slowed--;

  // Out-of-combat regen
  if (bot.status.burning === 0 && state.tick - bot.lastCombatTick >= OOC_REGEN_DELAY) {
    bot.hp = Math.min(BOT_HP, bot.hp + OOC_REGEN_RATE);
  }

  if (!action) return;

  const enemies = state.bots.filter(b => b.id !== bot.id);
  const enemy = enemies[0];
  if (!enemy) return;

  switch (action) {
    case 'melee':
      processMelee(bot, enemy, state);
      break;
    case 'ranged':
      processRanged(bot, enemy, state);
      break;
    case 'special':
      processSpecial(bot, enemy, state);
      break;
    case 'defend':
      processDefend(bot, state);
      break;
    case 'dash':
      processDash(bot, state);
      break;
    case 'heal':
      processHeal(bot, state);
      break;
    case 'trap':
      processTrap(bot, state);
      break;
  }
}

function processMelee(bot: BotData, enemy: BotData, state: GameState) {
  if (bot.cooldowns.melee > 0 || bot.energy < MELEE_ENERGY) return;

  bot.energy -= MELEE_ENERGY;
  bot.cooldowns.melee = MELEE_COOLDOWN;
  bot.actionsUsed['melee'] = (bot.actionsUsed['melee'] || 0) + 1;

  // Always commit on swing (even on miss)
  bot.status.attackCommit = MELEE_COMMIT_TICKS;
  bot.momentum = 0;

  const dist = distance(bot.position, enemy.position);
  if (dist > MELEE_RANGE) {
    state.events.push({
      type: 'miss',
      attacker: bot.id,
      position: { ...bot.position },
      text: `${bot.name} swings and misses!`,
    });
    return;
  }

  // Check facing (90-degree arc)
  const toEnemy = normalize(sub(enemy.position, bot.position));
  const facingDot = dot(bot.facing, toEnemy);
  if (facingDot < 0.3) {
    state.events.push({
      type: 'miss',
      attacker: bot.id,
      position: { ...bot.position },
      text: `${bot.name} swings in the wrong direction!`,
    });
    return;
  }

  let dmg = MELEE_DAMAGE;
  if (enemy.isDefending) dmg = Math.round(dmg * DEFEND_REDUCTION);

  enemy.hp -= dmg;
  bot.damageDealt += dmg;
  enemy.damageTaken += dmg;
  bot.lastCombatTick = state.tick;
  enemy.lastCombatTick = state.tick;

  state.events.push({
    type: 'melee_hit',
    attacker: bot.id,
    target: enemy.id,
    damage: dmg,
    position: { ...enemy.position },
    text: `${bot.name} hits ${enemy.name} for ${dmg} melee damage!`,
  });
}

function processRanged(bot: BotData, enemy: BotData, state: GameState) {
  if (bot.cooldowns.ranged > 0 || bot.energy < RANGED_ENERGY) return;

  bot.energy -= RANGED_ENERGY;
  bot.cooldowns.ranged = RANGED_COOLDOWN;
  bot.actionsUsed['ranged'] = (bot.actionsUsed['ranged'] || 0) + 1;

  const vel = {
    x: bot.facing.x * PROJECTILE_SPEED,
    y: bot.facing.y * PROJECTILE_SPEED,
  };

  state.addProjectile(bot.id, bot.position, vel, RANGED_DAMAGE);

  state.events.push({
    type: 'ranged_fire',
    attacker: bot.id,
    position: { ...bot.position },
    text: `${bot.name} fires a shot!`,
  });
}

function processSpecial(bot: BotData, enemy: BotData, state: GameState) {
  if (bot.cooldowns.special > 0 || bot.energy < SPECIAL_ENERGY) return;

  bot.energy -= SPECIAL_ENERGY;
  bot.cooldowns.special = SPECIAL_COOLDOWN;
  bot.actionsUsed['special'] = (bot.actionsUsed['special'] || 0) + 1;

  // Always commit on special (even on miss)
  bot.status.attackCommit = SPECIAL_COMMIT_TICKS;
  bot.momentum = 0;

  const dist = distance(bot.position, enemy.position);

  state.events.push({
    type: 'special_use',
    attacker: bot.id,
    position: { ...bot.position },
    text: `${bot.name} unleashes a SPECIAL attack!`,
  });

  if (dist <= SPECIAL_RANGE) {
    let dmg = SPECIAL_DAMAGE;
    if (enemy.isDefending) dmg = Math.round(dmg * DEFEND_REDUCTION);

    enemy.hp -= dmg;
    enemy.status.burning = BURN_DURATION;
    bot.damageDealt += dmg;
    enemy.damageTaken += dmg;
    bot.lastCombatTick = state.tick;
    enemy.lastCombatTick = state.tick;

    state.events.push({
      type: 'special_hit',
      attacker: bot.id,
      target: enemy.id,
      damage: dmg,
      position: { ...enemy.position },
      text: `${bot.name}'s special HITS ${enemy.name} for ${dmg}! ${enemy.name} is BURNING!`,
    });
  }
}

function processDefend(bot: BotData, state: GameState) {
  if (bot.energy < DEFEND_ENERGY_PER_TICK) return;

  bot.energy -= DEFEND_ENERGY_PER_TICK;
  bot.isDefending = true;
  bot.status.shielded = true;
  bot.actionsUsed['defend'] = (bot.actionsUsed['defend'] || 0) + 1;
}

function processDash(bot: BotData, state: GameState) {
  if (bot.cooldowns.dash > 0 || bot.energy < DASH_ENERGY) return;

  bot.energy -= DASH_ENERGY;
  bot.cooldowns.dash = DASH_COOLDOWN;
  bot.actionsUsed['dash'] = (bot.actionsUsed['dash'] || 0) + 1;

  bot.position.x += bot.facing.x * DASH_DISTANCE;
  bot.position.y += bot.facing.y * DASH_DISTANCE;

  state.events.push({
    type: 'dash_use',
    attacker: bot.id,
    position: { ...bot.position },
    text: `${bot.name} dashes forward!`,
  });
}

function processHeal(bot: BotData, state: GameState) {
  if (bot.cooldowns.heal > 0 || bot.energy < HEAL_ENERGY) return;

  bot.energy -= HEAL_ENERGY;
  bot.cooldowns.heal = HEAL_COOLDOWN;
  bot.actionsUsed['heal'] = (bot.actionsUsed['heal'] || 0) + 1;

  const healed = Math.min(HEAL_AMOUNT, BOT_HP - bot.hp);
  bot.hp = Math.min(BOT_HP, bot.hp + HEAL_AMOUNT);

  state.events.push({
    type: 'heal_use',
    attacker: bot.id,
    position: { ...bot.position },
    damage: healed,
    text: `${bot.name} heals for ${healed} HP!`,
  });
}

function processTrap(bot: BotData, state: GameState) {
  if (bot.cooldowns.trap > 0 || bot.energy < TRAP_ENERGY) return;

  // Enforce max active traps per bot
  const activeTraps = state.traps.filter(t => t.ownerId === bot.id && t.active).length;
  if (activeTraps >= TRAP_MAX_PER_BOT) return;

  bot.energy -= TRAP_ENERGY;
  bot.cooldowns.trap = TRAP_COOLDOWN;
  bot.actionsUsed['trap'] = (bot.actionsUsed['trap'] || 0) + 1;

  state.addTrap(bot.id, bot.position);

  state.events.push({
    type: 'trap_place',
    attacker: bot.id,
    position: { ...bot.position },
    text: `${bot.name} placed a trap!`,
  });
}

export function processProjectileHits(state: GameState) {
  const remaining: typeof state.projectiles = [];

  for (const proj of state.projectiles) {
    let hit = false;
    for (const bot of state.bots) {
      if (bot.id === proj.ownerId) continue;
      if (distance(proj.position, bot.position) < 1.3) {
        let dmg = proj.damage;
        if (bot.isDefending) dmg = Math.round(dmg * DEFEND_REDUCTION);

        bot.hp -= dmg;
        bot.damageTaken += dmg;
        bot.lastCombatTick = state.tick;
        const attacker = state.bots.find(b => b.id === proj.ownerId);
        if (attacker) {
          attacker.damageDealt += dmg;
          attacker.lastCombatTick = state.tick;
        }

        state.events.push({
          type: 'ranged_hit',
          attacker: proj.ownerId,
          target: bot.id,
          damage: dmg,
          position: { ...proj.position },
          text: `${attacker?.name}'s shot hits ${bot.name} for ${dmg}!`,
        });
        hit = true;
        break;
      }
    }
    if (!hit) remaining.push(proj);
  }

  state.projectiles = remaining;
}

export function checkKO(state: GameState) {
  for (const bot of state.bots) {
    if (bot.hp <= 0) {
      bot.hp = 0;
      state.gameOver = true;
      const winner = state.bots.find(b => b.id !== bot.id);
      state.winner = winner ? winner.id : null;
      state.events.push({
        type: 'ko',
        target: bot.id,
        text: `${bot.name} has been KNOCKED OUT!`,
      });
    }
  }
}
