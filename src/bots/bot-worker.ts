// Web Worker for sandboxed bot code execution

let thinkFn: ((me: any, enemies: any[], arena: any) => any) | null = null;

// Block dangerous globals
const _self = self as any;
_self.fetch = undefined;
_self.XMLHttpRequest = undefined;
_self.WebSocket = undefined;
_self.importScripts = undefined;

// Dangerous patterns to reject before compiling
const DANGEROUS_PATTERNS = [
  /\bpostMessage\b/,
  /\bself\./,
  /\bsetInterval\b/,
  /\bsetTimeout\b/,
  /\beval\b/,
  /\bFunction\b/,
  /\bimportScripts\b/,
];

function validateCode(code: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      return `Blocked: code contains forbidden pattern "${pattern.source}"`;
    }
  }
  return null;
}

function compileThinkFn(code: string): ((me: any, enemies: any[], arena: any) => any) {
  const factory = new Function(`
    "use strict";
    ${code}
    return think;
  `);
  const fn = factory();
  if (typeof fn !== 'function') {
    throw new Error('think is not a function');
  }
  return fn;
}

self.onmessage = (e: MessageEvent) => {
  const { type, data } = e.data;

  if (type === 'init') {
    try {
      const code = data.code;
      const validationError = validateCode(code);
      if (validationError) {
        self.postMessage({ type: 'error', error: `Init error: ${validationError}` });
        return;
      }
      thinkFn = compileThinkFn(code);
      self.postMessage({ type: 'ready' });
    } catch (err: any) {
      self.postMessage({ type: 'error', error: `Init error: ${err.message}` });
    }
  }

  if (type === 'recompile') {
    try {
      const code = data.code;
      const validationError = validateCode(code);
      if (validationError) {
        self.postMessage({ type: 'recompile_error', error: validationError });
        return;
      }
      const newFn = compileThinkFn(code);
      // Atomic swap — old thinkFn preserved on failure (we only get here on success)
      thinkFn = newFn;
      self.postMessage({ type: 'recompiled' });
    } catch (err: any) {
      self.postMessage({ type: 'recompile_error', error: `Compile error: ${err.message}` });
    }
  }

  if (type === 'tick') {
    if (!thinkFn) {
      self.postMessage({
        type: 'action',
        action: { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, action: null },
      });
      return;
    }

    try {
      const { me, enemies, arena } = data;
      const result = thinkFn(me, enemies, arena);

      // Sanitize output
      const action = {
        move: {
          x: Number(result?.move?.x) || 0,
          y: Number(result?.move?.y) || 0,
        },
        aim: {
          x: Number(result?.aim?.x) || 0,
          y: Number(result?.aim?.y) || 0,
        },
        action: ['melee', 'ranged', 'special', 'defend', 'dash', 'heal', 'trap'].includes(result?.action)
          ? result.action
          : null,
      };

      self.postMessage({ type: 'action', action });
    } catch (err: any) {
      self.postMessage({
        type: 'action',
        action: { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, action: null },
      });
    }
  }
};
