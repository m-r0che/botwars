import { defineConfig, loadEnv } from 'vite';
import type { Connect } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig(({ mode }) => {
  // Load all env vars (ANTHROPIC_*, OPENAI_*, etc.)
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      glsl(),
      {
        name: 'api-proxy',
        configureServer(server) {
          // ============================================
          // POST /api/generate-bot
          // Generates bot think() + style via Claude or OpenAI
          // ============================================
          server.middlewares.use('/api/generate-bot', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.end('Method not allowed');
              return;
            }

            const body = await readBody(req);
            try {
              const { name, personality, provider } = JSON.parse(body);
              const { systemPrompt } = await import('./src/bots/prompt.ts');

              if (provider === 'openai') {
                // ---------- OpenAI GPT-4.1 Nano via Responses API ----------
                const apiKey = env.OPENAI_API_KEY;
                if (!apiKey) {
                  sendJSON(res, 500, { error: 'OPENAI_API_KEY not set in .env' });
                  return;
                }

                const { default: OpenAI } = await import('openai');
                const openai = new OpenAI({ apiKey });

                const response = await openai.responses.create({
                  model: 'gpt-4.1-nano',
                  instructions: systemPrompt,
                  input: `Bot name: "${name}"\nPersonality/strategy: "${personality}"\n\nGenerate the think() function and STYLE JSON for this bot. Use the EXACT format specified (STYLE: then CODE:).`,
                  max_output_tokens: 2048,
                });

                // Extract text from response
                const text = extractOpenAIText(response);
                const { code, style } = parseStyleAndCode(text);
                sendJSON(res, 200, { code, style });

              } else {
                // ---------- Claude Opus 4.6 (default) ----------
                const apiKey = env.ANTHROPIC_API_KEY;
                if (!apiKey) {
                  sendJSON(res, 500, { error: 'ANTHROPIC_API_KEY not set in .env' });
                  return;
                }

                const { default: Anthropic } = await import('@anthropic-ai/sdk');
                const anthropic = new Anthropic({ apiKey });

                const response = await anthropic.messages.create({
                  model: 'claude-haiku-4-5-20251001',
                  max_tokens: 2048,
                  system: systemPrompt,
                  messages: [{
                    role: 'user',
                    content: `Bot name: "${name}"\nPersonality/strategy: "${personality}"\n\nGenerate the think() function and STYLE JSON for this bot. Use the EXACT format specified (STYLE: then CODE:).`,
                  }],
                });

                const text = response.content
                  .filter((b: any) => b.type === 'text')
                  .map((b: any) => b.text)
                  .join('');
                const { code, style } = parseStyleAndCode(text);
                sendJSON(res, 200, { code, style });
              }
            } catch (err: any) {
              console.error('Generate bot error:', err);
              sendJSON(res, 500, { error: String(err.message || err) });
            }
          });

          // ============================================
          // POST /api/evolve/claude
          // Mid-match code evolution via Claude
          // ============================================
          server.middlewares.use('/api/evolve/claude', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.end('Method not allowed');
              return;
            }

            const body = await readBody(req);
            try {
              const { botName, personality, currentCode, situation } = JSON.parse(body);
              const apiKey = env.ANTHROPIC_API_KEY;
              if (!apiKey) {
                sendJSON(res, 500, { error: 'ANTHROPIC_API_KEY not set' });
                return;
              }

              const { buildEvolutionPrompt } = await import('./src/bots/prompt.ts');
              const { default: Anthropic } = await import('@anthropic-ai/sdk');
              const anthropic = new Anthropic({ apiKey });

              const response = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 2048,
                system: buildEvolutionPrompt(botName, personality),
                messages: [{
                  role: 'user',
                  content: `Current think() code:\n\`\`\`javascript\n${currentCode}\n\`\`\`\n\nBattle situation: ${situation}`,
                }],
              });

              const text = response.content
                .filter((b: any) => b.type === 'text')
                .map((b: any) => b.text)
                .join('');
              const parsed = parseEvolutionResponse(text);
              sendJSON(res, 200, parsed);
            } catch (err: any) {
              console.error('Claude evolution error:', err);
              if (!res.headersSent) {
                sendJSON(res, 500, { error: String(err.message || err) });
              }
            }
          });

          // ============================================
          // POST /api/evolve/openai
          // Mid-match code evolution via OpenAI
          // ============================================
          server.middlewares.use('/api/evolve/openai', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.end('Method not allowed');
              return;
            }

            const body = await readBody(req);
            try {
              const { botName, personality, currentCode, situation } = JSON.parse(body);
              const apiKey = env.OPENAI_API_KEY;
              if (!apiKey) {
                sendJSON(res, 500, { error: 'OPENAI_API_KEY not set' });
                return;
              }

              const { buildEvolutionPrompt } = await import('./src/bots/prompt.ts');
              const { default: OpenAI } = await import('openai');
              const openai = new OpenAI({ apiKey });

              const response = await openai.responses.create({
                model: 'gpt-4.1-nano',
                instructions: buildEvolutionPrompt(botName, personality),
                input: `Current think() code:\n\`\`\`javascript\n${currentCode}\n\`\`\`\n\nBattle situation: ${situation}`,
                max_output_tokens: 2048,
              });

              const text = extractOpenAIText(response);
              const parsed = parseEvolutionResponse(text);
              sendJSON(res, 200, parsed);
            } catch (err: any) {
              console.error('OpenAI evolution error:', err);
              if (!res.headersSent) {
                sendJSON(res, 500, { error: String(err.message || err) });
              }
            }
          });
        },
      },
    ],
  };
});

// --- Helpers ---

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
  });
}

function sendJSON(res: any, status: number, data: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function parseStyleAndCode(text: string): { code: string; style: any } {
  let code = text;
  let style = null;

  const codeSplit = text.split(/^CODE:\s*$/m);
  if (codeSplit.length >= 2) {
    const beforeCode = codeSplit[0];
    const afterCode = codeSplit.slice(1).join('CODE:');

    // Extract function from CODE section
    const fnMatch = afterCode.match(/function\s+think\s*\([^)]*\)\s*\{[\s\S]*\}/);
    code = fnMatch ? fnMatch[0] : afterCode.trim();

    // Extract STYLE JSON from before CODE
    const styleMatch = beforeCode.match(/STYLE:\s*\n?\s*(\{[\s\S]*?\})\s*$/m);
    if (styleMatch) {
      try {
        style = JSON.parse(styleMatch[1]);
      } catch {
        // style parse failed, use default
      }
    }
  } else {
    // Fallback: no CODE: marker, extract function directly
    const fnMatch = text.match(/function\s+think\s*\([^)]*\)\s*\{[\s\S]*\}/);
    code = fnMatch ? fnMatch[0] : text;
  }

  return { code, style };
}

function parseEvolutionResponse(text: string): { code: string | null; thought: string } {
  let thought = '';
  let code: string | null = null;

  // Extract THOUGHT section
  const thoughtMatch = text.match(/THOUGHT:\s*\n?([\s\S]*?)(?=\nCODE:|$)/);
  if (thoughtMatch) {
    thought = thoughtMatch[1].trim();
  }

  // Extract CODE section (same pattern as parseStyleAndCode for CODE part)
  const codeSplit = text.split(/^CODE:\s*$/m);
  if (codeSplit.length >= 2) {
    const afterCode = codeSplit.slice(1).join('CODE:');
    const fnMatch = afterCode.match(/function\s+think\s*\([^)]*\)\s*\{[\s\S]*\}/);
    code = fnMatch ? fnMatch[0] : null;
  } else {
    // Try finding a function even without explicit CODE: marker
    const fnMatch = text.match(/function\s+think\s*\([^)]*\)\s*\{[\s\S]*\}/);
    if (fnMatch) {
      code = fnMatch[0];
    }
  }

  // If no thought extracted, use first line as fallback
  if (!thought && !text.match(/THOUGHT:/)) {
    thought = text.split('\n')[0].slice(0, 120);
  }

  return { code, thought };
}

function extractOpenAIText(response: any): string {
  // Responses API returns output items
  if (response.output) {
    for (const item of response.output) {
      if (item.type === 'message' && item.content) {
        for (const part of item.content) {
          if (part.type === 'output_text') return part.text;
        }
      }
    }
  }
  // Fallback for direct text
  if (response.output_text) return response.output_text;
  return '';
}
