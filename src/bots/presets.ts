import type { BotStyle } from '../engine/types';

export const presetStyles: Record<string, BotStyle> = {
  berserker: {
    bodyShape: 'icosahedron',
    bodyScale: { x: 1.2, y: 0.8, z: 1.2 },
    accentColor: '#ff2200',
    eyeSize: 'large',
    eyeStyle: 'angry',
    pupilColor: '#330000',
    aura: false,
    auraColor: '#ff0000',
    bobSpeed: 3,
    bobAmount: 1.5,
    spiky: true,
  },
  sniper: {
    bodyShape: 'tetrahedron',
    bodyScale: { x: 0.8, y: 1.2, z: 0.8 },
    accentColor: '#9933ff',
    eyeSize: 'normal',
    eyeStyle: 'sleepy',
    pupilColor: '#220044',
    aura: true,
    auraColor: '#aa55ff',
    bobSpeed: 1,
    bobAmount: 0.6,
    spiky: false,
  },
  turtle: {
    bodyShape: 'cube',
    bodyScale: { x: 1.3, y: 0.7, z: 1.3 },
    accentColor: '#22aa44',
    eyeSize: 'small',
    eyeStyle: 'normal',
    pupilColor: '#112211',
    aura: false,
    auraColor: '#44ff88',
    bobSpeed: 0.6,
    bobAmount: 0.5,
    spiky: false,
  },
  chaotic: {
    bodyShape: 'octahedron',
    bodyScale: { x: 1, y: 1, z: 1 },
    accentColor: '#ff00ff',
    eyeSize: 'large',
    eyeStyle: 'wide',
    pupilColor: '#330033',
    aura: true,
    auraColor: '#ff44ff',
    bobSpeed: 4,
    bobAmount: 1.8,
    spiky: false,
  },
  trapper: {
    bodyShape: 'tetrahedron',
    bodyScale: { x: 0.9, y: 1.1, z: 0.9 },
    accentColor: '#ffaa00',
    eyeSize: 'normal',
    eyeStyle: 'sleepy',
    pupilColor: '#332200',
    aura: true,
    auraColor: '#ffcc44',
    bobSpeed: 1.5,
    bobAmount: 0.8,
    spiky: false,
  },
};

export const presetPersonalities: Record<string, { name: string; personality: string }> = {
  berserker: {
    name: 'Berserker',
    personality: 'A reckless warrior who charges in headfirst and never retreats. Always goes for melee attacks.',
  },
  sniper: {
    name: 'Ghost',
    personality: 'A patient assassin who keeps maximum distance and only fires ranged shots. Hides behind obstacles.',
  },
  turtle: {
    name: 'Fortress',
    personality: 'A defensive tank who shields constantly and only attacks when energy is full. Prefers special attacks.',
  },
  chaotic: {
    name: 'Chaos',
    personality: 'A completely unpredictable maniac who randomly switches between all actions and runs in circles.',
  },
  trapper: {
    name: 'Trapper',
    personality: 'A cunning tactician who lays traps, kites enemies, and heals when low. Uses dash to escape danger.',
  },
};

// Pre-built think functions for instant play (no API needed)
export const presetCode: Record<string, string> = {
  berserker: `function think(me, enemies, arena) {
  const enemy = enemies[0];
  if (!enemy) return { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, action: null };

  // Always charge toward enemy
  const dx = enemy.position.x - me.position.x;
  const dy = enemy.position.y - me.position.y;
  const dist = enemy.distance;

  const aim = { x: dx, y: dy };
  const move = { x: dx, y: dy };

  // Melee when close, dash to close gaps, otherwise charge
  let action = null;
  if (dist < 2.0 && me.cooldowns.melee === 0 && me.energy >= 12) {
    action = 'melee';
  } else if (dist > 4.0 && dist < 10.0 && me.cooldowns.dash === 0 && me.energy >= 15) {
    action = 'dash';
  } else if (dist < 8.0 && me.cooldowns.special === 0 && me.energy >= 40) {
    action = 'special';
  } else if (dist > 5.0 && me.cooldowns.ranged === 0 && me.energy >= 14) {
    action = 'ranged';
  }

  return { move, aim, action };
}`,

  sniper: `function think(me, enemies, arena) {
  const enemy = enemies[0];
  if (!enemy) return { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, action: null };

  const dx = enemy.position.x - me.position.x;
  const dy = enemy.position.y - me.position.y;
  const dist = enemy.distance;

  // Wall avoidance — push away from nearby walls
  const half = arena.bounds.width / 2;
  const wallMargin = 5;
  let wallX = 0, wallY = 0;
  if (me.position.x > half - wallMargin) wallX = -(me.position.x - (half - wallMargin)) / wallMargin;
  if (me.position.x < -half + wallMargin) wallX = (-half + wallMargin - me.position.x) / wallMargin;
  if (me.position.y > half - wallMargin) wallY = -(me.position.y - (half - wallMargin)) / wallMargin;
  if (me.position.y < -half + wallMargin) wallY = (-half + wallMargin - me.position.y) / wallMargin;

  let aim = { x: dx, y: dy };

  let move;
  if (!enemy.visible) {
    // Enemy hidden — sweep aim to scan for them
    const sweep = Math.sin(me.tickCount * 0.15) * 0.6;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    aim = { x: nx + (-ny) * sweep, y: ny + nx * sweep };
    // Cautiously approach last-known position
    move = { x: dx * 0.4 + wallX, y: dy * 0.4 + wallY };
  } else if (dist < 10) {
    // Retreat but blend wall avoidance to avoid corners
    move = { x: -dx + wallX * 3, y: -dy + wallY * 3 };
  } else if (dist > 15) {
    move = { x: dx * 0.3, y: dy * 0.3 }; // Slowly approach
  } else {
    // Strafe
    move = { x: -dy * 0.5 + wallX, y: dx * 0.5 + wallY };
  }

  let action = null;
  if (enemy.visible && me.cooldowns.ranged === 0 && me.energy >= 14) {
    action = 'ranged';
  } else if (dist < 3 && me.cooldowns.melee === 0 && me.energy >= 12) {
    action = 'melee';
  } else if (dist < 3 && me.energy >= 3) {
    action = 'defend';
  }

  return { move, aim, action };
}`,

  turtle: `function think(me, enemies, arena) {
  const enemy = enemies[0];
  if (!enemy) return { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, action: null };

  const dx = enemy.position.x - me.position.x;
  const dy = enemy.position.y - me.position.y;
  const dist = enemy.distance;

  const aim = { x: dx, y: dy };

  // Stay near center
  const move = { x: -me.position.x * 0.1, y: -me.position.y * 0.1 };

  let action = null;
  if (me.hp < 50 && me.cooldowns.heal === 0 && me.energy >= 30) {
    action = 'heal';
  } else if (me.energy >= 60 && me.cooldowns.special === 0 && dist < 8) {
    action = 'special';
  } else if (me.energy >= 40 && me.cooldowns.ranged === 0 && dist > 3) {
    action = 'ranged';
  } else if (me.energy >= 10) {
    action = 'defend';
  }

  return { move, aim, action };
}`,

  trapper: `function think(me, enemies, arena) {
  const enemy = enemies[0];
  if (!enemy) return { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, action: null };

  const dx = enemy.position.x - me.position.x;
  const dy = enemy.position.y - me.position.y;
  const dist = enemy.distance;

  // Wall avoidance — push away from nearby walls
  const half = arena.bounds.width / 2;
  const wallMargin = 5;
  let wallX = 0, wallY = 0;
  if (me.position.x > half - wallMargin) wallX = -(me.position.x - (half - wallMargin)) / wallMargin;
  if (me.position.x < -half + wallMargin) wallX = (-half + wallMargin - me.position.x) / wallMargin;
  if (me.position.y > half - wallMargin) wallY = -(me.position.y - (half - wallMargin)) / wallMargin;
  if (me.position.y < -half + wallMargin) wallY = (-half + wallMargin - me.position.y) / wallMargin;

  const aim = { x: dx, y: dy };

  let move;
  let action = null;

  if (!enemy.visible) {
    // Enemy hidden — lay traps at choke points and heal
    move = { x: -dy * 0.3 + wallX, y: dx * 0.3 + wallY };
    if (me.hp < 60 && me.cooldowns.heal === 0 && me.energy >= 30) {
      action = 'heal';
    } else if (me.cooldowns.trap === 0 && me.energy >= 20) {
      action = 'trap';
    }
  } else {
    // Kite away from enemy, blend wall avoidance
    if (dist < 6) {
      move = { x: -dx + wallX * 3, y: -dy + wallY * 3 };
    } else {
      move = { x: -dy * 0.5 + wallX, y: dx * 0.5 + wallY };
    }

    // Heal when hurt
    if (me.hp < 40 && me.cooldowns.heal === 0 && me.energy >= 30) {
      action = 'heal';
    }
    // Dash away when too close — dash perpendicular if near wall
    else if (dist < 3 && me.cooldowns.dash === 0 && me.energy >= 15) {
      const nearWall = Math.abs(wallX) > 0.3 || Math.abs(wallY) > 0.3;
      if (nearWall) {
        move = { x: -dy + wallX * 2, y: dx + wallY * 2 };
      } else {
        move = { x: -dx, y: -dy };
      }
      action = 'dash';
    }
    // Place traps in enemy's path
    else if (dist < 8 && me.cooldowns.trap === 0 && me.energy >= 20) {
      action = 'trap';
    }
    // Ranged poke
    else if (me.cooldowns.ranged === 0 && me.energy >= 14) {
      action = 'ranged';
    }
  }

  return { move, aim, action };
}`,

  chaotic: `function think(me, enemies, arena) {
  const enemy = enemies[0];
  if (!enemy) return { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, action: null };

  const dx = enemy.position.x - me.position.x;
  const dy = enemy.position.y - me.position.y;

  // Random movement with bias toward enemy
  const angle = Math.random() * Math.PI * 2;
  const move = {
    x: Math.cos(angle) * 0.7 + dx * 0.3,
    y: Math.sin(angle) * 0.7 + dy * 0.3,
  };

  const aim = { x: dx, y: dy };

  // Random action selection
  const roll = Math.random();
  let action = null;
  if (roll < 0.3 && me.cooldowns.melee === 0 && me.energy >= 12) {
    action = 'melee';
  } else if (roll < 0.6 && me.cooldowns.ranged === 0 && me.energy >= 14) {
    action = 'ranged';
  } else if (roll < 0.75 && me.cooldowns.special === 0 && me.energy >= 40) {
    action = 'special';
  } else if (roll < 0.85 && me.energy >= 3) {
    action = 'defend';
  }

  return { move, aim, action };
}`,
};
