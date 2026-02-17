import type { BotStyle } from '../engine/types';
import { DEFAULT_STYLE } from '../engine/types';

export async function generateBot(
  name: string,
  personality: string,
  provider: 'claude' | 'openai' = 'claude',
): Promise<{ code: string; style: BotStyle }> {
  const res = await fetch('/api/generate-bot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, personality, provider }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to generate bot');
  }

  const data = await res.json();
  return {
    code: data.code,
    style: data.style || DEFAULT_STYLE,
  };
}
