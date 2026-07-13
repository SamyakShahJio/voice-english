/**
 * Sarvam AI — backup voice provider (TTS + STT).
 * Used only when ElevenLabs quota runs out (or when VOICE_PROVIDER=sarvam).
 * Key lives server-side in SARVAM_API_KEY.
 */

const BASE = 'https://api.sarvam.ai';

function key() {
  const k = process.env.SARVAM_API_KEY;
  if (!k) throw new Error('SARVAM_API_KEY is not set');
  return k;
}

export function sarvamConfigured() {
  return !!process.env.SARVAM_API_KEY;
}

/**
 * Text -> speech. Returns an mp3 Buffer.
 * JBIQ's spoken text is Hindi (Devanagari) with some English — hi-IN + a
 * bulbul:v3 Indic voice handles the code-mix well.
 */
export async function sarvamTTS(text) {
  const speaker = process.env.SARVAM_VOICE || 'ritu';
  // v3 hard limit is 2500 chars; JBIQ turns are short, but guard anyway.
  const clipped = text.length > 2400 ? text.slice(0, 2400) : text;
  const res = await fetch(`${BASE}/text-to-speech`, {
    method: 'POST',
    headers: { 'api-subscription-key': key(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: clipped,
      target_language_code: 'hi-IN',
      model: 'bulbul:v3',
      speaker,
      pace: 1.0,
      speech_sample_rate: 44100,
      output_audio_codec: 'mp3',
    }),
  });
  if (!res.ok) throw new Error(`Sarvam TTS failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const b64 = (data.audios || []).join('');
  if (!b64) throw new Error('Sarvam TTS returned no audio');
  return Buffer.from(b64, 'base64');
}

/**
 * Speech -> text. Accepts the browser's webm/opus directly.
 * Returns the same shape as the Scribe path ({text, language, words}); Sarvam
 * has no per-word confidence, so words is empty (pronunciation flags just
 * degrade gracefully).
 */
export async function sarvamSTT(audioBuffer, mimeType = 'audio/webm') {
  const form = new FormData();
  form.append('model', 'saaras:v3');
  form.append('file', new Blob([audioBuffer], { type: mimeType }), 'turn.webm');
  const res = await fetch(`${BASE}/speech-to-text`, {
    method: 'POST',
    headers: { 'api-subscription-key': key() },
    body: form,
  });
  if (!res.ok) throw new Error(`Sarvam STT failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return {
    text: (data.transcript || '').trim(),
    language: data.language_code || 'unknown',
    words: [],
  };
}
