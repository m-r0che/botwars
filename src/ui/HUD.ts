import type { BotData } from '../engine/types';
import { MAX_TICKS, TICK_RATE } from '../utils/constants';

export function updateHUD(bots: BotData[], tick: number) {
  for (let i = 0; i < 2; i++) {
    const bot = bots[i];
    const prefix = i === 0 ? 'p1' : 'p2';

    // HP bar
    const hpBar = document.getElementById(`hud-${prefix}-hp`) as HTMLElement;
    const hpText = document.getElementById(`hud-${prefix}-hp-text`) as HTMLElement;
    const hpPercent = Math.max(0, bot.hp);
    hpBar.style.width = `${hpPercent}%`;
    hpText.textContent = `${Math.max(0, Math.ceil(bot.hp))}`;

    // HP bar color
    hpBar.className = 'bar hp-bar';
    if (hpPercent <= 25) hpBar.classList.add('low');
    else if (hpPercent <= 50) hpBar.classList.add('medium');

    // Energy bar
    const energyBar = document.getElementById(`hud-${prefix}-energy`) as HTMLElement;
    energyBar.style.width = `${bot.energy}%`;
  }

  // Timer
  const timerEl = document.getElementById('hud-timer')!;
  const secondsLeft = Math.ceil((MAX_TICKS - tick) / TICK_RATE);
  timerEl.textContent = `${secondsLeft}s`;
}

export function setHUDNames(name1: string, name2: string) {
  document.getElementById('hud-p1-name')!.textContent = name1;
  document.getElementById('hud-p2-name')!.textContent = name2;
}
