# Botwars Arena

A browser-based 3D battle game where you describe bot personalities in plain English, Claude generates their AI and visual style, and they fight it out in a Three.js arena.

## How It Works

1. **Describe** your bot's personality (e.g. "a reckless berserker that charges headfirst")
2. **Claude generates** a JavaScript `think()` function and a visual style for your bot
3. **Watch** your bots battle in real-time across procedurally generated arenas

Each bot's AI runs sandboxed in a Web Worker. The game engine ticks at 20 Hz with interpolated 60fps rendering, bloom, and a CRT post-processing shader.

## Features

- **AI-generated bots** — personality descriptions become fighting strategies and unique visuals
- **Mid-battle evolution** — Claude can rewrite a bot's AI on the fly to adapt to the fight
- **5 biomes** — volcanic, ice, cyber, forest, desert — each with terrain that affects gameplay
- **7 actions** — melee, ranged, special, defend, dash, heal, trap
- **Preset bots** — berserker, sniper, turtle, chaotic, trapper — playable without an API key
- **Vision & fog of war** — 160° FOV with line-of-sight blocked by obstacles

## Getting Started

```bash
git clone https://github.com/m-r0che/botwars.git
cd botwars
npm install
```

Copy `.env.example` to `.env` and add your API key:

```bash
cp .env.example .env
```

```
ANTHROPIC_API_KEY=sk-ant-...
```

Then start the dev server:

```bash
npm run dev
```

Open `http://localhost:5173` in your browser. You can use the preset bots without an API key.

## Tech Stack

- **Three.js** — 3D rendering, post-processing
- **Vite** — dev server + API proxy middleware
- **TypeScript** — throughout
- **Anthropic Claude API** — bot generation and mid-battle evolution
- **Web Workers** — sandboxed bot AI execution
