import { SceneManager } from './renderer/SceneManager';
import { ArenaRenderer } from './renderer/ArenaRenderer';
import { BotRenderer } from './renderer/BotRenderer';
import { ProjectileRenderer } from './renderer/ProjectileRenderer';
import { PickupRenderer } from './renderer/PickupRenderer';
import { TrapRenderer } from './renderer/TrapRenderer';
import { ParticleSystem } from './renderer/ParticleSystem';
import { ThoughtBubbleRenderer } from './renderer/ThoughtBubbleRenderer';
import { GameLoop } from './engine/GameLoop';
import type { GameState } from './engine/GameState';
import type { GameEvent, ArenaConfig } from './engine/types';
import { BotRunner } from './bots/BotRunner';
import { presetPersonalities, presetCode, presetStyles } from './bots/presets';
import { generateBot } from './utils/api';
import type { BotStyle } from './engine/types';
import { P1_COLOR, P2_COLOR } from './utils/constants';
import { showAnnouncement } from './ui/Announcer';
import { clearLog, addLogEntry } from './ui/BattleLog';
import { updateHUD, setHUDNames } from './ui/HUD';
import { spawnDamageNumber } from './ui/DamageNumbers';
import { generateArena } from './arena/ArenaGenerator';
import { CodeEvolutionManager } from './thoughts/CodeEvolutionManager';
import type { BotEvolutionConfig } from './thoughts/CodeEvolutionManager';

// State
let sceneManager: SceneManager | null = null;
let arenaRenderer: ArenaRenderer | null = null;
let botRenderer: BotRenderer | null = null;
let projectileRenderer: ProjectileRenderer | null = null;
let pickupRenderer: PickupRenderer | null = null;
let trapRenderer: TrapRenderer | null = null;
let particleSystem: ParticleSystem | null = null;
let thoughtRenderer: ThoughtBubbleRenderer | null = null;
let evolutionManager: CodeEvolutionManager | null = null;
let gameLoop: GameLoop | null = null;
let botRunner: BotRunner | null = null;
let animationId: number | null = null;
let currentArenaConfig: ArenaConfig | null = null;

const botCodes: [string | null, string | null] = [null, null];
const botStyles: [BotStyle | null, BotStyle | null] = [null, null];
const botNames: [string, string] = ['Bot 1', 'Bot 2'];
const botPersonalities: [string, string] = ['', ''];
// P1 = Claude, P2 = OpenAI
const botProviders: ['claude', 'openai'] = ['claude', 'openai'];

// Screens
function showScreen(id: string) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById(id)!.classList.add('active');
}

// Title Screen
document.getElementById('btn-start')!.addEventListener('click', () => {
  showScreen('creation-screen');
});

// Preset buttons
document.querySelectorAll('.btn-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = (btn as HTMLElement).dataset.preset!;
    const player = (btn as HTMLElement).dataset.player!;
    const data = presetPersonalities[preset];
    if (!data) return;

    const nameInput = document.getElementById(`p${player}-name`) as HTMLInputElement;
    const personalityInput = document.getElementById(`p${player}-personality`) as HTMLTextAreaElement;
    nameInput.value = data.name;
    personalityInput.value = data.personality;
  });
});

// Generate bot buttons
for (const playerId of [1, 2]) {
  const btn = document.getElementById(`p${playerId}-generate`) as HTMLButtonElement;
  btn.addEventListener('click', async () => {
    const name = (document.getElementById(`p${playerId}-name`) as HTMLInputElement).value.trim();
    const personality = (document.getElementById(`p${playerId}-personality`) as HTMLTextAreaElement).value.trim();

    if (!name || !personality) return;

    const statusEl = document.getElementById(`p${playerId}-status`)!;
    const codePeek = document.getElementById(`p${playerId}-code-peek`) as HTMLElement;
    const codeEl = document.getElementById(`p${playerId}-code`)!;

    btn.disabled = true;
    btn.classList.add('generating');
    const provider = botProviders[playerId - 1];
    statusEl.textContent = `Generating via ${provider === 'claude' ? 'Claude Haiku 4.5' : 'GPT-4.1 Nano'}...`;
    statusEl.className = 'bot-status generating';

    try {
      // Check if we have a preset code for this personality
      let code: string | null = null;
      let style: BotStyle | null = null;
      for (const [key, preset] of Object.entries(presetPersonalities)) {
        if (personality === preset.personality && name === preset.name) {
          code = presetCode[key];
          style = presetStyles[key] ?? null;
          break;
        }
      }

      if (!code) {
        const result = await generateBot(name, personality, provider);
        code = result.code;
        style = result.style;
      }

      botCodes[playerId - 1] = code;
      botStyles[playerId - 1] = style;
      botNames[playerId - 1] = name;
      botPersonalities[playerId - 1] = personality;
      statusEl.textContent = `Ready! (${provider === 'claude' ? 'Claude' : 'OpenAI'})`;
      statusEl.className = 'bot-status ready';
      codeEl.textContent = code;
      codePeek.style.display = 'block';
    } catch (err: any) {
      statusEl.textContent = `Error: ${err.message}`;
      statusEl.className = 'bot-status error';
    } finally {
      btn.disabled = false;
      btn.classList.remove('generating');
    }

    updateBattleButton();
  });
}

function updateBattleButton() {
  const btn = document.getElementById('btn-battle') as HTMLButtonElement;
  btn.disabled = !(botCodes[0] && botCodes[1]);
}

// Battle button
document.getElementById('btn-battle')!.addEventListener('click', startBattle);

async function startBattle() {
  if (!botCodes[0] || !botCodes[1]) return;

  showScreen('battle-screen');
  clearLog();

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

  // Initialize renderer
  if (!sceneManager) {
    sceneManager = new SceneManager(canvas);
    arenaRenderer = new ArenaRenderer(sceneManager.scene);
  }

  // Generate procedural arena
  currentArenaConfig = generateArena();
  addLogEntry(`Biome: ${currentArenaConfig.biome.toUpperCase()}`, 'system');

  // Set biome visuals
  sceneManager.setBiome(currentArenaConfig.biome);

  // Clear old objects
  botRenderer?.clear();
  projectileRenderer?.clear();
  pickupRenderer?.clear();
  trapRenderer?.clear();
  particleSystem?.clear();
  thoughtRenderer?.clear();
  evolutionManager?.dispose();

  // Rebuild arena
  arenaRenderer!.buildArena(currentArenaConfig);

  botRenderer = new BotRenderer(sceneManager.scene);
  botRenderer.setTerrain(currentArenaConfig.terrain);
  projectileRenderer = new ProjectileRenderer(sceneManager.scene);
  pickupRenderer = new PickupRenderer(sceneManager.scene);
  trapRenderer = new TrapRenderer(sceneManager.scene);
  particleSystem = new ParticleSystem(sceneManager.scene);
  thoughtRenderer = new ThoughtBubbleRenderer();

  botRenderer.createBots([botStyles[0], botStyles[1]]);
  setHUDNames(botNames[0], botNames[1]);

  // Set up code evolution manager
  evolutionManager = new CodeEvolutionManager();
  const botEvolutionConfigs: BotEvolutionConfig[] = [
    { id: 0, name: botNames[0], personality: botPersonalities[0], provider: 'claude' },
    { id: 1, name: botNames[1], personality: botPersonalities[1], provider: 'openai' },
  ];
  evolutionManager.configure(
    botEvolutionConfigs,
    {
      onCodeUpdate: async (botId, code) => {
        const success = await botRunner?.hotSwapCode(botId, code);
        if (success) {
          const provider = botId === 0 ? 'CLAUDE' : 'OPENAI';
          const cssClass = botId === 0 ? 'p1' : 'p2';
          addLogEntry(`[${provider}] ${botNames[botId]}'s brain evolved!`, cssClass);
        }
        return success ?? false;
      },
      onThoughtStart: (botId, provider) => {
        thoughtRenderer?.startThought(botId, provider);
      },
      onThoughtUpdate: (botId, text) => {
        thoughtRenderer?.updateText(botId, text);
      },
      onThoughtComplete: (botId, fullText, duration) => {
        thoughtRenderer?.completeThought(botId, duration);
        const provider = botId === 0 ? 'CLAUDE' : 'OPENAI';
        const cssClass = botId === 0 ? 'p1' : 'p2';
        addLogEntry(`[${provider}] ${botNames[botId]}: "${fullText}"`, cssClass);
      },
      onThoughtExpire: (_botId) => {
        // Don't remove — persist until next thought replaces it
      },
    },
    (botId) => botRunner?.getCode(botId) ?? null,
  );

  // Init bot workers
  botRunner = new BotRunner();
  try {
    await botRunner.initBot(0, botCodes[0]);
    await botRunner.initBot(1, botCodes[1]);
  } catch (err: any) {
    addLogEntry(`Error initializing bots: ${err.message}`, 'system');
    return;
  }

  // Start game loop
  gameLoop = new GameLoop(
    onTick,
    async (botId, state) => {
      return botRunner!.getAction(
        botId,
        state.getBotState(botId),
        state.getEnemyStates(botId),
        state.getArenaState(),
      );
    },
    onGameOver,
  );

  // Set arena config on game state before starting
  gameLoop.state.arenaConfig = currentArenaConfig;
  gameLoop.start(botNames[0], botNames[1]);

  // Show announcement
  setTimeout(() => showAnnouncement('BATTLE START!', '#ffeb3b', 1500), 300);
  addLogEntry('BATTLE START!', 'system');

  // Start render loop
  if (animationId) cancelAnimationFrame(animationId);
  renderLoop();
}

function onTick(state: GameState, events: GameEvent[]) {
  // Feed events to evolution manager
  evolutionManager?.processEvents(state, events);

  // Process events for UI
  for (const event of events) {
    if (event.text) {
      const cssClass = event.attacker !== undefined
        ? (event.attacker === 0 ? 'p1' : 'p2')
        : 'system';
      addLogEntry(event.text, cssClass);
    }

    // Damage numbers
    if (event.damage && event.position && sceneManager) {
      const type = event.type === 'special_hit' ? 'special' : 'damage';
      spawnDamageNumber(event.position, event.damage, type, sceneManager.camera, sceneManager.renderer);
    }

    // Particles
    if (event.position && particleSystem) {
      const color = event.attacker === 0 ? P1_COLOR : P2_COLOR;
      if (event.type === 'melee_hit') {
        particleSystem.emit(event.position, color, 10);
        if (event.target !== undefined) botRenderer?.flashHit(event.target);
        screenShake();
      } else if (event.type === 'ranged_hit') {
        particleSystem.emit(event.position, color, 6);
        if (event.target !== undefined) botRenderer?.flashHit(event.target);
      } else if (event.type === 'special_hit' || event.type === 'special_use') {
        particleSystem.emitExplosion(event.position, 0xff00ff);
        if (event.target !== undefined) botRenderer?.flashHit(event.target);
        screenShake();
      }
    }

    // New ability effects
    if (event.position && particleSystem) {
      if (event.type === 'dash_use') {
        const color = event.attacker === 0 ? P1_COLOR : P2_COLOR;
        particleSystem.emit(event.position, color, 8);
        if (event.attacker !== undefined) botRenderer?.flashDash(event.attacker);
      } else if (event.type === 'heal_use') {
        particleSystem.emit(event.position, 0x44ff44, 10);
        if (event.attacker !== undefined) botRenderer?.flashHeal(event.attacker);
      } else if (event.type === 'trap_place') {
        const color = event.attacker === 0 ? P1_COLOR : P2_COLOR;
        particleSystem.emit(event.position, color, 4);
      } else if (event.type === 'trap_trigger') {
        particleSystem.emitExplosion(event.position, 0xff8800);
        if (event.target !== undefined) botRenderer?.flashHit(event.target);
        screenShake();
      }
    }

    // Heal damage number (show as green)
    if (event.type === 'heal_use' && event.damage && event.position && sceneManager) {
      spawnDamageNumber(event.position, event.damage, 'heal', sceneManager.camera, sceneManager.renderer);
    }

    // Trap trigger damage number
    if (event.type === 'trap_trigger' && event.damage && event.position && sceneManager) {
      spawnDamageNumber(event.position, event.damage, 'special', sceneManager.camera, sceneManager.renderer);
    }

    // KO announcement
    if (event.type === 'ko') {
      showAnnouncement('K.O.!', '#ff6b6b', 2000);
    }
  }

  // Update HUD
  updateHUD(state.bots, state.tick);
}

function onGameOver(state: GameState) {
  evolutionManager?.dispose();

  setTimeout(() => {
    const winScreen = document.getElementById('win-screen')!;
    const winTitle = document.getElementById('win-announcement')!;
    const winStats = document.getElementById('win-stats')!;

    if (state.winner !== null) {
      const winner = state.bots[state.winner];
      winTitle.textContent = `${winner.name} WINS!`;
      winTitle.style.color = state.winner === 0 ? '#ff6b6b' : '#4ecdc4';
    } else {
      winTitle.textContent = 'DRAW!';
      winTitle.style.color = '#ffeb3b';
    }

    const statsHTML = state.bots.map(bot => {
      const provider = bot.id === 0 ? 'Claude Haiku 4.5' : 'GPT-4.1 Nano';
      return `<div>
        <strong style="color: ${bot.id === 0 ? '#ff6b6b' : '#4ecdc4'}">${bot.name}</strong>
        <span style="opacity: 0.6; font-size: 0.8em">(${provider})</span><br>
        HP: ${Math.max(0, Math.ceil(bot.hp))} | Damage Dealt: ${bot.damageDealt} | Damage Taken: ${bot.damageTaken}
      </div>`;
    }).join('<br>');
    winStats.innerHTML = statsHTML;

    showScreen('win-screen');
  }, 2500);
}

function renderLoop() {
  animationId = requestAnimationFrame(renderLoop);

  if (!sceneManager || !gameLoop) return;

  const time = sceneManager.getElapsedTime();
  const alpha = gameLoop.getInterpolationAlpha();

  // Update arena particles
  arenaRenderer?.update(time);

  // Update bot renderers
  if (botRenderer && gameLoop.state.bots.length >= 2) {
    botRenderer.update(
      gameLoop.state.bots,
      gameLoop.prevPositions,
      gameLoop.currPositions,
      alpha,
      time,
    );
  }

  if (projectileRenderer) {
    projectileRenderer.update(gameLoop.state.projectiles);
  }

  if (pickupRenderer) {
    pickupRenderer.update(gameLoop.state.pickups, time);
  }

  if (trapRenderer) {
    trapRenderer.update(gameLoop.state.traps, time);
  }

  if (particleSystem) {
    particleSystem.update();
  }

  // Update thought bubbles
  if (thoughtRenderer) {
    thoughtRenderer.update();
  }

  // Expire old thoughts
  evolutionManager?.update(performance.now());

  sceneManager.render();
}

function screenShake() {
  const canvas = document.getElementById('game-canvas');
  if (canvas) {
    canvas.classList.add('screen-shake');
    setTimeout(() => canvas.classList.remove('screen-shake'), 150);
  }
}

// Rematch / New bots
document.getElementById('btn-rematch')!.addEventListener('click', () => {
  botRunner?.terminate();
  evolutionManager?.dispose();
  startBattle();
});

document.getElementById('btn-new-bots')!.addEventListener('click', () => {
  botRunner?.terminate();
  evolutionManager?.dispose();
  gameLoop?.stop();
  if (animationId) cancelAnimationFrame(animationId);
  botCodes[0] = null;
  botCodes[1] = null;
  botStyles[0] = null;
  botStyles[1] = null;

  // Reset status
  for (const p of [1, 2]) {
    document.getElementById(`p${p}-status`)!.textContent = '';
    document.getElementById(`p${p}-status`)!.className = 'bot-status';
    (document.getElementById(`p${p}-code-peek`) as HTMLElement).style.display = 'none';
  }
  updateBattleButton();
  showScreen('creation-screen');
});
