/**
 * voice-english server
 * --------------------
 * Holds the API keys and orchestrates the voice loop:
 *   /api/stt   audio  -> Scribe            -> transcript (+word confidence)
 *   /api/chat  text   -> Claude (JBIQ)    -> spoken reply + session state
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
import { sarvamTTS, sarvamSTT, sarvamConfigured } from './sarvam.js';
import { runTurn } from './claude.js';
import { speechText } from './text.js';

// auto = ElevenLabs, fall back to Sarvam only when EL quota runs out.
// Force one provider with VOICE_PROVIDER=elevenlabs | sarvam.
const VOICE_PROVIDER = () => process.env.VOICE_PROVIDER || 'auto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// Password gate (HTTP Basic Auth). Active only when APP_PASSWORD is set — so
// local dev is frictionless, but a deployed instance is protected. Any
// username works; only the password is checked. /api/health stays open so
// hosting platforms can run their uptime checks.
const APP_PASSWORD = process.env.APP_PASSWORD;
if (APP_PASSWORD) {
  app.use((req, res, next) => {
    if (req.path === '/api/health') return next();
    const [scheme, encoded] = (req.headers.authorization || '').split(' ');
    if (scheme === 'Basic' && encoded) {
      const pass = Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':');
      if (pass === APP_PASSWORD) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="JBIQ"');
    return res.status(401).send('Authentication required');
  });
}

app.use(express.json({ limit: '1mb' }));
// Audio arrives as a raw binary body.
app.use('/api/stt', express.raw({ type: () => true, limit: '25mb' }));

app.use(express.static(join(__dirname, '..', 'public')));

/** Speech -> text. ElevenLabs Scribe, with Sarvam as the quota fallback. */
app.post('/api/stt', async (req, res) => {
  if (!req.body || !req.body.length) {
    return res.status(400).json({ error: 'empty audio body' });
  }
  const mime = req.headers['content-type'] || 'audio/webm';
  const provider = VOICE_PROVIDER();

  if (provider === 'sarvam' && sarvamConfigured()) {
    try { return res.json(await sarvamSTT(req.body, mime)); }
    catch (e) { console.error('[stt sarvam]', e.message); return res.status(502).json({ error: e.message }); }
  }
  try {
    res.json(await transcribe(req.body, mime));
  } catch (err) {
    console.error('[stt]', err.message);
    const quota = /quota/i.test(err.message);
    if (quota && provider === 'auto' && sarvamConfigured()) {
      try { console.warn('[stt] EL quota — Sarvam fallback'); return res.json(await sarvamSTT(req.body, mime)); }
      catch (e2) { console.error('[stt sarvam fallback]', e2.message); }
    }
    res.status(quota ? 429 : 502).json({ error: err.message, code: quota ? 'quota_exceeded' : 'upstream' });
  }
});

/** One conversational turn with JBIQ. */
app.post('/api/chat', async (req, res) => {
  try {
    const { messages = [], state = { phase: 'onboarding' } } = req.body || {};
    const { reply, speech, state: nextState } = await runTurn(messages, state);
    res.json({ reply, speech, state: nextState });
  } catch (err) {
    console.error('[chat]', err.message);
    res.status(502).json({ error: err.message });
  }
});

/** Text -> speech. ElevenLabs (streamed), with Sarvam as the quota fallback. */
app.post('/api/tts', async (req, res) => {
  const raw = (req.body && req.body.text) || '';
  const text = speechText(raw).trim();
  if (!text) return res.status(400).json({ error: 'empty text' });
  const provider = VOICE_PROVIDER();

  const sendSarvam = async () => {
    const buf = await sarvamTTS(text);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.end(buf);
  };

  if (provider === 'sarvam' && sarvamConfigured()) {
    try { return await sendSarvam(); }
    catch (e) { console.error('[tts sarvam]', e.message); return res.status(502).json({ error: e.message }); }
  }
  try {
    const upstream = await ttsStream(text);
    res.setHeader('Content-Type', 'audio/mpeg');
    // Pipe ElevenLabs' streaming body straight through to the browser.
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    console.error('[tts]', err.message);
    const quota = /quota/i.test(err.message);
    if (quota && provider === 'auto' && sarvamConfigured()) {
      try { console.warn('[tts] EL quota — Sarvam fallback'); return await sendSarvam(); }
      catch (e2) { console.error('[tts sarvam fallback]', e2.message); }
    }
    res.status(quota ? 429 : 502).json({ error: err.message, code: quota ? 'quota_exceeded' : 'upstream' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
    voice: process.env.JBIQ_VOICE_ID || 'Ms9OTvWb99V6DwRHZn6q',
    hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
    hasElevenLabs: !!process.env.ELEVENLABS_API_KEY,
    voiceProvider: process.env.VOICE_PROVIDER || 'auto',
    sarvamBackup: sarvamConfigured() ? (process.env.SARVAM_VOICE || 'ritu') : false,
  });
});

const PORT = process.env.PORT || 8795;
app.listen(PORT, () => {
  console.log(`voice-english running on http://localhost:${PORT}`);
  console.log(`  model: ${process.env.CLAUDE_MODEL || 'claude-sonnet-5'}`);
  console.log(`  voice: ${process.env.JBIQ_VOICE_ID || 'Ms9OTvWb99V6DwRHZn6q'}`);
});
