/**
 * voice-english server
 * --------------------
 * Holds the API keys and orchestrates the voice loop:
 *   /api/stt   audio  -> Scribe            -> transcript (+word confidence)
 *   /api/chat  text   -> Claude (Sarah)    -> spoken reply + session state
 *   /api/tts   text   -> ElevenLabs stream -> mp3 audio
 *
 * The browser holds the conversation history and session state and passes
 * them back each turn, so the server stays stateless and simple.
 */

import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';

import { transcribe, ttsStream } from './elevenlabs.js';
import { runTurn } from './claude.js';
import { stripMarkers } from './text.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '1mb' }));
// Audio arrives as a raw binary body.
app.use('/api/stt', express.raw({ type: () => true, limit: '25mb' }));

app.use(express.static(join(__dirname, '..', 'public')));

/** Speech -> text. */
app.post('/api/stt', async (req, res) => {
  try {
    if (!req.body || !req.body.length) {
      return res.status(400).json({ error: 'empty audio body' });
    }
    const mime = req.headers['content-type'] || 'audio/webm';
    const result = await transcribe(req.body, mime);
    res.json(result);
  } catch (err) {
    console.error('[stt]', err.message);
    res.status(502).json({ error: err.message });
  }
});

/** One conversational turn with Sarah. */
app.post('/api/chat', async (req, res) => {
  try {
    const { messages = [], state = { phase: 'onboarding' } } = req.body || {};
    const { reply, state: nextState } = await runTurn(messages, state);
    res.json({ reply, state: nextState });
  } catch (err) {
    console.error('[chat]', err.message);
    res.status(502).json({ error: err.message });
  }
});

/** Text -> streamed speech. Expects one sentence/phrase at a time. */
app.post('/api/tts', async (req, res) => {
  try {
    const raw = (req.body && req.body.text) || '';
    const text = stripMarkers(raw).trim();
    if (!text) return res.status(400).json({ error: 'empty text' });

    const upstream = await ttsStream(text);
    res.setHeader('Content-Type', 'audio/mpeg');
    // Pipe ElevenLabs' streaming body straight through to the browser.
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    console.error('[tts]', err.message);
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
    voice: process.env.SARAH_VOICE_ID || 'Ms9OTvWb99V6DwRHZn6q',
    hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
    hasElevenLabs: !!process.env.ELEVENLABS_API_KEY,
  });
});

const PORT = process.env.PORT || 8795;
app.listen(PORT, () => {
  console.log(`voice-english running on http://localhost:${PORT}`);
  console.log(`  model: ${process.env.CLAUDE_MODEL || 'claude-sonnet-5'}`);
  console.log(`  voice: ${process.env.SARAH_VOICE_ID || 'Ms9OTvWb99V6DwRHZn6q'}`);
});
