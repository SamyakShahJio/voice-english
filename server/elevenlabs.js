/**
 * ElevenLabs — speech-to-text (Scribe) and text-to-speech (streaming).
 * The API key lives only here on the server; the browser never sees it.
 */

const BASE = 'https://api.elevenlabs.io/v1';

function key() {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error('ELEVENLABS_API_KEY is not set');
  return k;
}

/**
 * Transcribe a recorded audio turn.
 * @param {Buffer} audioBuffer  raw audio (webm/opus, wav, mp3…)
 * @param {string} mimeType
 * @returns {Promise<{text:string, language:string, words:Array}>}
 */
export async function transcribe(audioBuffer, mimeType = 'audio/webm') {
  const form = new FormData();
  form.append('model_id', process.env.STT_MODEL || 'scribe_v1');
  // Let Scribe auto-detect: learners mix Hindi and English freely.
  form.append('file', new Blob([audioBuffer], { type: mimeType }), 'turn.webm');

  const res = await fetch(`${BASE}/speech-to-text`, {
    method: 'POST',
    headers: { 'xi-api-key': key() },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Scribe STT failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  return {
    text: (data.text || '').trim(),
    language: data.language_code || 'unknown',
    // Keep only real words with their confidence — used for pronunciation feedback.
    words: (data.words || [])
      .filter((w) => w.type === 'word')
      .map((w) => ({ text: w.text, logprob: w.logprob })),
  };
}

/**
 * Stream TTS audio for a chunk of JBIQ's speech.
 * Returns a fetch Response whose body is an mp3 stream — pipe it straight to
 * the client so playback can start before the whole clip is generated.
 * @param {string} text  a single sentence/phrase (already marker-stripped)
 */
export async function ttsStream(text) {
  const voiceId = process.env.JBIQ_VOICE_ID || 'Ms9OTvWb99V6DwRHZn6q';
  const model = process.env.TTS_MODEL || 'eleven_multilingual_v2';

  const res = await fetch(
    `${BASE}/text-to-speech/${voiceId}/stream?optimize_streaming_latency=3&output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': key(),
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
          style: 0.15,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${detail}`);
  }
  return res;
}
