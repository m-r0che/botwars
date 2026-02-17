import type { BotData, Projectile, ObstacleData, TerrainData } from './types';
import {
  BOT_RADIUS, BOT_SPEED, ARENA_HALF, DEFAULT_OBSTACLES, PROJECTILE_SPEED, TERRAIN_SLOPE_MAX,
  COMMIT_SPEED_MULT, MOMENTUM_BUILDUP, MOMENTUM_DECAY, MOMENTUM_MAX_BONUS,
} from '../utils/constants';
import { distance, normalize, sub, add, scale, length, vec2 } from '../utils/math';
import { sampleTerrainHeight, sampleTerrainSlope } from '../arena/ArenaGenerator';

export function applyMovement(
  bot: BotData,
  move: { x: number; y: number },
  terrain?: TerrainData,
) {
  let mx = move.x;
  let my = move.y;

  // Normalize if magnitude > 1
  const mag = Math.sqrt(mx * mx + my * my);
  if (mag > 1) {
    mx /= mag;
    my /= mag;
  }

  let speed = bot.status.slowed > 0 ? BOT_SPEED * 0.5 : BOT_SPEED;

  // Terrain slope modifier
  if (terrain) {
    const slope = sampleTerrainSlope(terrain, bot.position.x, bot.position.y);
    if (slope > TERRAIN_SLOPE_MAX) {
      // Too steep — block movement in uphill direction
      speed *= 0.1;
    } else if (slope > 0.1) {
      // Gradual slope: check if moving uphill or downhill
      const hCurrent = sampleTerrainHeight(terrain, bot.position.x, bot.position.y);
      const hAhead = sampleTerrainHeight(
        terrain,
        bot.position.x + mx * 0.5,
        bot.position.y + my * 0.5,
      );
      if (hAhead > hCurrent) {
        // Uphill — slow down proportionally
        speed *= Math.max(0.4, 1.0 - slope * 0.8);
      } else {
        // Downhill — speed up slightly
        speed *= Math.min(1.4, 1.0 + slope * 0.3);
      }
    }
  }

  // Momentum update: check alignment between old velocity and new move direction
  const oldVelMag = Math.sqrt(bot.velocity.x * bot.velocity.x + bot.velocity.y * bot.velocity.y);
  const newMoveMag = Math.sqrt(mx * mx + my * my);
  if (oldVelMag > 0.01 && newMoveMag > 0.01) {
    const alignment = (bot.velocity.x * mx + bot.velocity.y * my) / (oldVelMag * newMoveMag);
    if (alignment > 0.7) {
      bot.momentum = Math.min(1.0, bot.momentum + MOMENTUM_BUILDUP);
    } else {
      bot.momentum *= MOMENTUM_DECAY;
    }
  } else {
    bot.momentum *= MOMENTUM_DECAY;
  }

  // Speed modifiers: attack commitment vs momentum
  if (bot.status.attackCommit > 0) {
    speed *= COMMIT_SPEED_MULT;
    bot.momentum = 0;
  } else {
    speed *= (1.0 + bot.momentum * MOMENTUM_MAX_BONUS);
  }

  bot.velocity.x = mx * speed;
  bot.velocity.y = my * speed;

  bot.position.x += bot.velocity.x;
  bot.position.y += bot.velocity.y;
}

export function applyFacing(bot: BotData, aim: { x: number; y: number }) {
  const len = Math.sqrt(aim.x * aim.x + aim.y * aim.y);
  if (len > 0) {
    bot.facing.x = aim.x / len;
    bot.facing.y = aim.y / len;
  }
}

export function clampToBounds(bot: BotData) {
  const limit = ARENA_HALF - BOT_RADIUS;
  bot.position.x = Math.max(-limit, Math.min(limit, bot.position.x));
  bot.position.y = Math.max(-limit, Math.min(limit, bot.position.y));
}

export function resolveBotCollision(a: BotData, b: BotData) {
  const dist = distance(a.position, b.position);
  const minDist = BOT_RADIUS * 2;

  if (dist < minDist && dist > 0) {
    const dir = normalize(sub(b.position, a.position));
    const overlap = (minDist - dist) / 2;
    a.position.x -= dir.x * overlap;
    a.position.y -= dir.y * overlap;
    b.position.x += dir.x * overlap;
    b.position.y += dir.y * overlap;
  }
}

export function resolveObstacleCollision(
  bot: BotData,
  dynamicObstacles?: ObstacleData[],
) {
  const obstacles = dynamicObstacles
    ? dynamicObstacles.map(o => ({ x: o.position.x, y: o.position.y, radius: o.radius }))
    : DEFAULT_OBSTACLES;

  for (const obs of obstacles) {
    const obsPos = vec2(obs.x, obs.y);
    const dist = distance(bot.position, obsPos);
    const minDist = BOT_RADIUS + obs.radius;

    if (dist < minDist && dist > 0) {
      const dir = normalize(sub(bot.position, obsPos));
      const overlap = minDist - dist;
      bot.position.x += dir.x * overlap;
      bot.position.y += dir.y * overlap;
    }
  }
}

export function updateProjectiles(
  projectiles: Projectile[],
  dynamicObstacles?: ObstacleData[],
): Projectile[] {
  const obstacles = dynamicObstacles
    ? dynamicObstacles.map(o => ({ x: o.position.x, y: o.position.y, radius: o.radius }))
    : DEFAULT_OBSTACLES;

  return projectiles.filter(p => {
    p.position.x += p.velocity.x;
    p.position.y += p.velocity.y;
    p.lifetime--;

    // Remove if out of bounds
    if (Math.abs(p.position.x) > ARENA_HALF || Math.abs(p.position.y) > ARENA_HALF) {
      return false;
    }

    // Remove if hit obstacle
    for (const obs of obstacles) {
      if (distance(p.position, { x: obs.x, y: obs.y }) < obs.radius) {
        return false;
      }
    }

    return p.lifetime > 0;
  });
}

export function checkProjectileHit(projectile: Projectile, bot: BotData): boolean {
  return distance(projectile.position, bot.position) < BOT_RADIUS + 0.3;
}
