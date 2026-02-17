const CHARS_PER_SEC = 60;

const CLAUDE_COLOR = '#7c3aed';
const OPENAI_COLOR = '#10b981';

interface ActiveTyping {
  botId: number;
  entryEl: HTMLElement;
  textEl: HTMLElement;
  fullText: string;
  displayedChars: number;
  startTime: number;
  done: boolean;
}

export class ThoughtBubbleRenderer {
  private container: HTMLElement;
  private activeTyping: Map<number, ActiveTyping> = new Map();

  constructor(_scene?: any) {
    let container = document.getElementById('thought-log');
    if (!container) {
      container = document.createElement('div');
      container.id = 'thought-log';
      document.body.appendChild(container);
    }
    this.container = container;
  }

  startThought(botId: number, provider: 'claude' | 'openai') {
    // Create a new log entry (don't remove old ones)
    const entryEl = document.createElement('div');
    entryEl.className = `thought-entry thought-p${botId + 1}`;

    const labelEl = document.createElement('span');
    labelEl.className = 'thought-entry-label';
    const label = provider === 'claude' ? 'CLAUDE' : 'OPENAI';
    labelEl.textContent = `[${label}] `;
    labelEl.style.color = provider === 'claude' ? CLAUDE_COLOR : OPENAI_COLOR;
    entryEl.appendChild(labelEl);

    const textEl = document.createElement('span');
    textEl.className = 'thought-entry-text';
    entryEl.appendChild(textEl);

    this.container.appendChild(entryEl);
    this.container.scrollTop = this.container.scrollHeight;

    // If there's an in-progress typing for this bot, finalize it
    const prev = this.activeTyping.get(botId);
    if (prev && !prev.done) {
      prev.textEl.textContent = prev.fullText;
      prev.done = true;
    }

    this.activeTyping.set(botId, {
      botId,
      entryEl,
      textEl,
      fullText: '',
      displayedChars: 0,
      startTime: performance.now(),
      done: false,
    });
  }

  updateText(botId: number, text: string) {
    const typing = this.activeTyping.get(botId);
    if (!typing) return;
    typing.fullText = text;
  }

  completeThought(_botId: number, _duration: number) {
    // No-op — log entries persist
  }

  removeThought(_botId: number) {
    // No-op — log entries persist
  }

  update() {
    const now = performance.now();

    for (const [, typing] of this.activeTyping) {
      if (typing.done) continue;

      const elapsed = (now - typing.startTime) / 1000;
      const targetChars = Math.floor(elapsed * CHARS_PER_SEC);

      if (targetChars > typing.displayedChars && typing.displayedChars < typing.fullText.length) {
        typing.displayedChars = Math.min(targetChars, typing.fullText.length);
        const displayText = typing.fullText.substring(0, typing.displayedChars);
        const cursor = typing.displayedChars < typing.fullText.length ? '\u2588' : '';
        typing.textEl.textContent = displayText + cursor;
        this.container.scrollTop = this.container.scrollHeight;
      }

      if (typing.displayedChars >= typing.fullText.length && typing.fullText.length > 0) {
        typing.textEl.textContent = typing.fullText;
        typing.done = true;
      }
    }
  }

  clear() {
    this.container.innerHTML = '';
    this.activeTyping.clear();
  }
}
