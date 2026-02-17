import type { BotAction, BotState, EnemyState, ArenaState } from '../engine/types';
import BotWorker from './bot-worker.ts?worker';

export class BotRunner {
  private workers: Worker[] = [];
  private pendingActions: Map<number, (action: BotAction) => void> = new Map();
  private ready: boolean[] = [false, false];
  private currentCode: Map<number, string> = new Map();

  async initBot(botId: number, code: string): Promise<void> {
    // Terminate existing worker if any
    if (this.workers[botId]) {
      this.workers[botId].terminate();
    }

    this.currentCode.set(botId, code);

    return new Promise((resolve, reject) => {
      const worker = new BotWorker();
      this.workers[botId] = worker;

      const timeout = setTimeout(() => {
        reject(new Error('Worker init timeout'));
      }, 5000);

      worker.onmessage = (e: MessageEvent) => {
        const { type, error } = e.data;

        if (type === 'ready') {
          clearTimeout(timeout);
          this.ready[botId] = true;

          // Set up tick handler (also handles recompile responses)
          worker.onmessage = (e2: MessageEvent) => {
            if (e2.data.type === 'action') {
              const resolve = this.pendingActions.get(botId);
              if (resolve) {
                this.pendingActions.delete(botId);
                resolve(e2.data.action);
              }
            }
            // recompiled / recompile_error handled via hotSwapCode's temporary listener
          };

          resolve();
        } else if (type === 'error') {
          clearTimeout(timeout);
          reject(new Error(error));
        }
      };

      worker.onerror = (err: ErrorEvent) => {
        clearTimeout(timeout);
        reject(new Error(`Worker error: ${err.message}`));
      };

      worker.postMessage({ type: 'init', data: { code } });
    });
  }

  getCode(botId: number): string | null {
    return this.currentCode.get(botId) ?? null;
  }

  hotSwapCode(botId: number, code: string): Promise<boolean> {
    return new Promise((resolve) => {
      const worker = this.workers[botId];
      if (!worker || !this.ready[botId]) {
        resolve(false);
        return;
      }

      const timeout = setTimeout(() => {
        resolve(false);
      }, 5000);

      // Temporarily intercept onmessage to catch recompile response
      const originalHandler = worker.onmessage;
      worker.onmessage = (e: MessageEvent) => {
        if (e.data.type === 'recompiled') {
          clearTimeout(timeout);
          this.currentCode.set(botId, code);
          worker.onmessage = originalHandler;
          resolve(true);
        } else if (e.data.type === 'recompile_error') {
          clearTimeout(timeout);
          console.warn(`Hot-swap failed for bot ${botId}: ${e.data.error}`);
          worker.onmessage = originalHandler;
          resolve(false);
        } else {
          // Forward tick actions to original handler
          if (originalHandler) {
            originalHandler.call(worker, e);
          }
        }
      };

      worker.postMessage({ type: 'recompile', data: { code } });
    });
  }

  getAction(botId: number, me: BotState, enemies: EnemyState[], arena: ArenaState): Promise<BotAction> {
    return new Promise((resolve) => {
      const worker = this.workers[botId];
      if (!worker || !this.ready[botId]) {
        resolve({ move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, action: null });
        return;
      }

      // Timeout after 50ms
      const timeout = setTimeout(() => {
        this.pendingActions.delete(botId);
        resolve({ move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, action: null });
      }, 50);

      this.pendingActions.set(botId, (action) => {
        clearTimeout(timeout);
        resolve(action);
      });

      worker.postMessage({
        type: 'tick',
        data: { me, enemies, arena },
      });
    });
  }

  terminate() {
    for (const worker of this.workers) {
      if (worker) worker.terminate();
    }
    this.workers = [];
    this.ready = [false, false];
    this.currentCode.clear();
  }
}
