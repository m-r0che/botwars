# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BOTWARS ARENA — a browser-based 3D battle game where players describe bot personalities in natural language, Claude generates JavaScript AI (`think()` functions) and visual styles (`BotStyle` JSON), and the bots fight in real-time in a Three.js arena.

## Commands

```bash
npm run dev      # Start Vite dev server (serves game + API proxy)
npm run build    # Type-check (tsc) + production build
npx tsc --noEmit # Type-check only
```

No test runner or linter is configured.

## Architecture

### Tick-Based Engine + Interpolated Rendering

The game runs a deterministic simulation at 20 Hz (50ms ticks) decoupled from 60fps rendering. `GameLoop` drives ticks, emits `GameEvent` objects, and exposes `getInterpolationAlpha()` for smooth rendering between ticks. The render loop in `main.ts` lerps bot positions using this alpha.

### Bot Generation & Execution Pipeline

1. **Generation:** Player personality → `POST /api/generate-bot` (Vite middleware in `vite.config.ts`) → Anthropic Claude API → parses `STYLE:` JSON + `CODE:` function from response
2. **Presets:** `src/bots/presets.ts` has pre-built `think()` functions and `BotStyle` objects for instant play without API calls (berserker, sniper, turtle, chaotic, trapper)
3. **Execution:** Each bot's `think()` runs in a Web Worker (`src/bots/bot-worker.ts`) with dangerous APIs (`fetch`, `WebSocket`, `importScripts`) blocked. Actions timeout at 50ms per tick. `BotRunner` orchestrates worker lifecycle.
4. **Evolution:** `CodeEvolutionManager` can call Claude mid-battle to rewrite a bot's `think()` function, adapting to the current situation. Uses `buildEvolutionPrompt()` from `src/bots/prompt.ts`.

### Rendering Architecture

Separate renderer classes (`BotRenderer`, `ArenaRenderer`, `ProjectileRenderer`, `PickupRenderer`, `TrapRenderer`, `ParticleSystem`, `ThoughtBubbleRenderer`) each own their Three.js objects and expose `update()`/`clear()`. `SceneManager` owns the scene, camera, and post-processing chain (bloom + CRT shader). `BotRenderer.createBots()` accepts `BotStyle` to customize body geometry, eye expression, spikes, aura, and animation.

### Arena & Terrain

`ArenaGenerator` produces procedural arenas with biome-specific obstacles and terrain heightmaps. Five biomes: volcanic, ice, cyber, forest, desert — each with distinct color palettes defined in `constants.ts`. Terrain affects movement speed (uphill slows, downhill speeds up, steep slopes block).

### Screen Flow

`main.ts` manages four HTML screens: Title → Creation (personality input + presets + generate) → Battle (3D canvas + HUD) → Win (stats). All UI modules (`src/ui/`) are event-driven, updating from `GameEvent` objects emitted by the tick callback.

## Key Files

- `vite.config.ts` — API proxy middleware that calls Claude and parses STYLE/CODE response sections
- `src/utils/constants.ts` — All game balance values (HP, damage, cooldowns, arena size, pickup rates)
- `src/engine/types.ts` — Core interfaces (`BotState`, `BotAction`, `BotStyle`, `BotData`, `DEFAULT_STYLE`)
- `src/engine/GameState.ts` — Authoritative game state: bots, projectiles, pickups, traps, visibility
- `src/engine/Combat.ts` — Action processing, damage, status effects, OOC regen
- `src/engine/Physics.ts` — Movement, momentum, collision resolution, projectile updates
- `src/bots/prompt.ts` — System prompt + evolution prompt sent to Claude for bot generation

## Game Balance

Arena is 40×40 units. Bots have 1000 HP, 100 energy (regens 1/tick). Max game duration: 2400 ticks (120 seconds).

### Actions

| Action  | Energy | Cooldown | Range | Damage | Notes |
|---------|--------|----------|-------|--------|-------|
| melee   | 12     | 10 ticks | 2.0   | 9      | Arc attack in facing direction |
| ranged  | 14     | 15 ticks | 20.0  | 8      | Fires projectile in facing direction |
| special | 40     | 50 ticks | 8.0   | 12     | AoE burst + burning (1 dmg/tick, 20 ticks) |
| defend  | 3/tick | 0        | self  | 0      | 65% damage reduction (takes 35%) |
| dash    | 15     | 12 ticks | self  | 0      | Instant 5-unit burst in facing direction |
| heal    | 30     | 40 ticks | self  | 0      | Restore 15 HP |
| trap    | 20     | 25 ticks | self  | 10     | Place mine; 10 dmg + 30-tick slow on trigger; max 2 per bot |

### Combat Mechanics

- **Attack commitment:** Melee slows to 15% speed for 3 ticks after use; special for 4 ticks. Zeroes momentum. Applies even on miss.
- **Out-of-combat regen:** After 40 ticks (2 sec) without dealing/taking damage, bots passively regen 2 HP/tick. Burning resets the timer.
- **Momentum:** Consistent movement direction builds speed up to +50% bonus (0.12/tick buildup, 0.5 decay on direction change). Attack commitment zeroes it.
- **Vision:** 160° FOV cone in facing direction. Line of sight blocked by obstacles. When not visible, enemy position reported as last-known (stale).
- **Terrain:** Uphill slows, downhill speeds up, steep slopes block movement.
- **Wall awareness:** Bots should blend wall-repulsion vectors when near arena edges to avoid corner-pinning. Presets and prompt examples demonstrate this pattern.

## API Response Format

The LLM is prompted to return:
```
STYLE:
{...BotStyle JSON...}

CODE:
function think(me, enemies, arena) { ... }
```
`vite.config.ts` splits on `CODE:`, extracts style JSON from before it and the function from after it. Falls back to `DEFAULT_STYLE` if style parsing fails.
