# voice-english — JBIQ

A **voice-first English coach** for Hindi speakers. JBIQ teaches English but talks
to you in **Hindi**. There's no menu — you tell her, out loud, what you want to
practise, and she figures out the situation, picks a scenario, clarifies anything
missing, then coaches you live: model a phrase, listen to you try it, give
targeted feedback, move on.

Everything is voice. The screen is only an aid (the English phrase to repeat, a
rolling transcript).

## Pipeline

```
mic → VAD (silence/endpoint + barge-in)
    → /api/stt   → ElevenLabs Scribe        → transcript + word confidence
    → /api/chat  → Claude (JBIQ's brain)   → spoken reply + session state
    → /api/tts   → ElevenLabs streaming TTS  → audio → play → listen again
```

- **STT:** ElevenLabs Scribe (auto-detects Hindi / English / Hinglish).
- **Brain:** Claude, model set by `CLAUDE_MODEL` (toggle Sonnet ↔ Haiku).
- **Voice:** ElevenLabs, Monika Sogam by default (`JBIQ_VOICE_ID`), multilingual model.
- **Onboarding** is done by Claude via a `begin_session` tool that slot-fills
  situation + scenario from natural speech.
- **Grounding:** curated scenarios in `server/prompts/scenarios.js` sharpen the
  teaching when a request matches; anything else is coached live.
- **Guardrails:** off-topic / meta / role-change / unsafe input all handled in
  Hindi, in `server/prompts/system.js`.

## Run

```bash
npm install
cp .env.example .env   # then fill in the two keys
npm start              # http://localhost:8795
```

Open in **Chrome or Edge** (needs mic + MediaRecorder + Web Audio), click
**शुरू करें**, allow the mic, and start talking.

> The keys are server-side only (`.env`, gitignored). The browser never sees them.

## Files

```
server/
  index.js            express app + 3 endpoints
  claude.js           JBIQ's turn (tool loop → reply + state)
  elevenlabs.js       Scribe STT + streaming TTS
  text.js             [[EN: …]] marker helpers
  prompts/
    system.js         persona, Hindi medium, voice rules, guardrails, phases
    scenarios.js      curated curriculum (grounding)
public/
  index.html style.css app.js   minimal voice UI + VAD engine
```
