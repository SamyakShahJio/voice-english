/**
 * voice-english client
 * --------------------
 * Fully voice-driven. No buttons to progress a lesson — the mic and an
 * energy-based VAD decide when the learner has finished a turn, then:
 *   record -> /api/stt -> /api/chat (JBIQ) -> /api/tts -> play -> listen again
 * Supports barge-in (start speaking to interrupt JBIQ).
 */

// ---- tunables ----
const SILENCE_MS = 900;       // trailing silence that ends a turn
const SPEECH_ONSET_MS = 150;  // sustained voice needed to count as "speaking"
const NO_INPUT_MS = 9000;     // silence before a gentle re-prompt
const BARGE_MIN_MS = 400;     // sustained voice needed to interrupt JBIQ
const BARGE_GUARD_MS = 500;   // ignore mic for this long after JBIQ starts
const ENABLE_BARGE_IN = true;

// ---- element refs ----
const el = {
  orb: document.getElementById('orb'),
  status: document.getElementById('status'),
  cards: document.getElementById('cards'),
  transcript: document.getElementById('transcript'),
  lesson: document.getElementById('lessonLabel'),
  start: document.getElementById('startBtn'),
  stop: document.getElementById('stopBtn'),
};

// ---- session state ----
const messages = [];                 // [{role, content}] sent to /api/chat
let sessionState = { phase: 'onboarding' };
let running = false;
let voiceDown = false; // set when ElevenLabs quota / voice is unavailable

// ---- audio graph ----
let audioCtx, analyser, micStream, playGain, timeData;
let recorder, recChunks = [], recMime = 'audio/webm';

// ---- VAD bookkeeping ----
let mode = 'idle';                   // idle | listening | speaking
let noiseFloor = 0.006, speechThreshold = 0.015, bargeThreshold = 0.03;
let hasSpoken = false, voiceFrames = 0, bargeFrames = 0;
let listenStartTs = 0, lastVoiceTs = 0, speakStartTs = 0;
let noInputTries = 0;
let currentSource = null, bargedIn = false;

// ============================================================ boot
el.start.addEventListener('click', start);
el.stop.addEventListener('click', stop);

// Mic is on by default — begin the moment the page loads.
start();

// Browsers may create the AudioContext suspended until a user gesture. The mic
// is already live; we just need one interaction to unlock audio playback.
function ensureAudioRunning() {
  if (audioCtx.state === 'running') return Promise.resolve();
  setStatus('Sunne ke liye taiyaar — kahin bhi tap karein');
  return new Promise((resolve) => {
    const go = async () => {
      window.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
      try { await audioCtx.resume(); } catch {}
      resolve();
    };
    window.addEventListener('pointerdown', go);
    window.addEventListener('keydown', go);
  });
}

async function start() {
  if (running) return;
  el.start.disabled = true;
  setStatus('Microphone allow kar rahe hain…');
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (err) {
    fail('Microphone allow karna zaroori hai. Browser settings mein permission dijiye.');
    el.start.disabled = false;
    return;
  }

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  try { await audioCtx.resume(); } catch {}
  const src = audioCtx.createMediaStreamSource(micStream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  timeData = new Float32Array(analyser.fftSize);
  src.connect(analyser); // analyser is a sink; not routed to speakers
  playGain = audioCtx.createGain();
  playGain.connect(audioCtx.destination);
  loadThinkingChime();

  recMime = pickMime();
  running = true;
  el.start.hidden = true;
  el.stop.hidden = false;

  requestAnimationFrame(tick);
  await ensureAudioRunning();
  await calibrate();
  await greet();
}

function stop() {
  running = false;
  stopThinkingCue();
  try { stopPlayback(); } catch {}
  try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch {}
  try { micStream && micStream.getTracks().forEach((t) => t.stop()); } catch {}
  try { audioCtx && audioCtx.close(); } catch {}
  mode = 'idle';
  setOrb('idle');
  setStatus('Rok diya. Dobara shuru karein?');
  el.stop.hidden = true;
  el.start.hidden = false;
  el.start.disabled = false;
}

function pickMime() {
  const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return cands.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || 'audio/webm';
}

// ============================================================ calibration
async function calibrate() {
  setStatus('Ek pal… awaaz set kar rahe hain');
  const samples = [];
  const until = performance.now() + 450;
  await new Promise((resolve) => {
    const id = setInterval(() => {
      samples.push(readRMS());
      if (performance.now() > until) { clearInterval(id); resolve(); }
    }, 20);
  });
  const avg = samples.reduce((a, b) => a + b, 0) / Math.max(samples.length, 1);
  noiseFloor = avg || 0.006;
  speechThreshold = Math.max(0.012, noiseFloor * 3.5);
  bargeThreshold = Math.max(0.025, noiseFloor * 6);
}

// ============================================================ VAD loop
function readRMS() {
  analyser.getFloatTimeDomainData(timeData);
  let sum = 0;
  for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i];
  return Math.sqrt(sum / timeData.length);
}

function tick() {
  if (!running) return;
  requestAnimationFrame(tick);
  const rms = readRMS();
  const now = performance.now();

  if (mode === 'listening') {
    el.orb.style.setProperty('--level', Math.min(rms / 0.12, 1).toFixed(3));
    if (rms > speechThreshold) {
      lastVoiceTs = now;
      voiceFrames++;
      if (!hasSpoken && voiceFrames * 16 >= SPEECH_ONSET_MS) hasSpoken = true;
    } else {
      voiceFrames = 0;
    }
    if (hasSpoken && now - lastVoiceTs > SILENCE_MS) {
      endUserTurn();
    } else if (!hasSpoken && now - listenStartTs > NO_INPUT_MS) {
      handleNoInput();
    }
  } else if (mode === 'speaking' && ENABLE_BARGE_IN) {
    if (now - speakStartTs > BARGE_GUARD_MS) {
      if (rms > bargeThreshold) {
        bargeFrames++;
        if (bargeFrames * 16 >= BARGE_MIN_MS) doBargeIn();
      } else {
        bargeFrames = 0;
      }
    }
  }
}

// ============================================================ listening
function enterListening() {
  if (!running || voiceDown) return;
  stopThinkingCue();
  mode = 'listening';
  hasSpoken = false;
  voiceFrames = 0;
  listenStartTs = lastVoiceTs = performance.now();
  setOrb('listening');
  setStatus('Boliye… sun rahi hoon');

  recChunks = [];
  try {
    recorder = new MediaRecorder(micStream, { mimeType: recMime });
  } catch {
    recorder = new MediaRecorder(micStream);
  }
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
  recorder.start(100);
}

function endUserTurn() {
  if (mode !== 'listening') return;
  mode = 'thinking';
  setOrb('thinking');
  setStatus('Samajh rahi hoon…');
  startThinkingCue();
  const rec = recorder;
  if (rec && rec.state !== 'inactive') {
    rec.onstop = () => {
      const blob = new Blob(recChunks, { type: recMime });
      handleUserTurn(blob);
    };
    rec.stop();
  }
}

async function handleNoInput() {
  if (mode !== 'listening') return;
  noInputTries++;
  // discard the empty recording
  mode = 'thinking';
  startThinkingCue();
  try { if (recorder && recorder.state !== 'inactive') { recorder.onstop = null; recorder.stop(); } } catch {}

  if (noInputTries > 2) {
    setStatus('Jab taiyaar hon, boliye. Mic chaalu hai.');
    noInputTries = 0;
    enterListening();
    return;
  }
  // one gentle, un-stored re-prompt from JBIQ
  const transient = messages.concat({
    role: 'user',
    content: '[learner abhi tak chup hai — unhe pyaar se, ek chhoti line mein dobara bulao]',
  });
  try {
    const { reply, speech, state } = await chat(transient, sessionState);
    sessionState = state;
    addBubble('jbiq', reply);
    await speak(speech || reply);
  } catch (err) {
    console.error(err);
  }
  if (running) enterListening();
}

// ============================================================ one turn
async function handleUserTurn(blob) {
  if (blob.size < 1200) { // basically silence / a click
    if (running) enterListening();
    return;
  }
  let stt;
  try {
    stt = await transcribe(blob);
  } catch (err) {
    console.error(err);
    if (err && err.quota) { voiceError(); return; }
    setStatus('STT mein dikkat aayi, dobara boliye.');
    if (running) enterListening();
    return;
  }
  const text = (stt.text || '').trim();
  if (!text) { if (running) enterListening(); return; }

  addBubble('user', text);
  noInputTries = 0;

  const modelContent = text + confidenceNote(stt.words || []);
  messages.push({ role: 'user', content: modelContent });

  let reply, speech, state;
  try {
    ({ reply, speech, state } = await chat(messages, sessionState));
  } catch (err) {
    console.error(err);
    setStatus('JBIQ se connect nahi ho paaya, dobara koshish.');
    if (running) enterListening();
    return;
  }
  sessionState = state;
  updateLessonLabel();
  messages.push({ role: 'assistant', content: reply });

  addBubble('jbiq', reply);
  renderCards(reply);
  await speak(speech || reply);
  if (running) enterListening();
}

/** Words the STT was least sure about — likely pronunciation trouble. */
function confidenceNote(words) {
  const low = words
    .filter((w) => w.logprob < -1.2 && /[a-zA-Z]/.test(w.text))
    .map((w) => w.text.replace(/[^a-zA-Z']/g, ''))
    .filter(Boolean)
    .slice(0, 6);
  if (!low.length) return '';
  return `\n\n[coach note — learner's least-clear words (possible pronunciation issues): ${low.join(', ')}]`;
}

// ============================================================ speaking (TTS)
async function speak(reply) {
  const chunks = splitIntoSpeakables(reply);
  if (!chunks.length) return;
  bargedIn = false;
  bargeFrames = 0;
  mode = 'speaking';
  stopThinkingCue();
  speakStartTs = performance.now();
  setOrb('speaking');
  setStatus('JBIQ bol rahi hain…');

  const clips = new Array(chunks.length);
  clips[0] = fetchClip(chunks[0]);
  for (let i = 0; i < chunks.length; i++) {
    if (i + 1 < chunks.length) clips[i + 1] = fetchClip(chunks[i + 1]); // prefetch next
    let buf;
    try { buf = await clips[i]; }
    catch (err) { if (err && err.quota) { voiceError(); return; } console.error('tts', err); continue; }
    if (bargedIn || !running) break;
    // Reset the guard window at each chunk boundary so mid-sentence echo
    // doesn't accumulate false barge-ins.
    speakStartTs = performance.now();
    await playBuffer(buf);
    if (bargedIn || !running) break;
  }
}

async function fetchClip(text) {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw Object.assign(new Error('tts ' + res.status), { quota: res.status === 429 });
  const arr = await res.arrayBuffer();
  return await audioCtx.decodeAudioData(arr);
}

function playBuffer(buf) {
  return new Promise((resolve) => {
    const source = audioCtx.createBufferSource();
    source.buffer = buf;
    source.connect(playGain);
    source.onended = () => { if (currentSource === source) currentSource = null; resolve(); };
    currentSource = source;
    source.start();
  });
}

function stopPlayback() {
  if (currentSource) {
    try { currentSource.onended = null; currentSource.stop(); } catch {}
    currentSource = null;
  }
}

function doBargeIn() {
  if (mode !== 'speaking') return;
  bargedIn = true;
  stopPlayback();
  // caller's speak() loop will exit; handleUserTurn then calls enterListening.
  // But greet()/re-prompt also await speak — so enter listening here too.
  enterListening();
}

// ============================================================ thinking cue
// A soft two-note bell (public/thinking.wav) that repeats gently while JBIQ is
// processing — so the learner knows it heard them and is working, even before
// the reply audio starts.
let thinkingBuffer = null, thinkingTimer = null, thinkingSources = [];
async function loadThinkingChime() {
  if (thinkingBuffer || !audioCtx) return;
  try {
    const res = await fetch('/thinking.wav');
    thinkingBuffer = await audioCtx.decodeAudioData(await res.arrayBuffer());
  } catch { /* no chime if it fails to load */ }
}
function playThinkingOnce() {
  if (!audioCtx || audioCtx.state !== 'running' || !thinkingBuffer) return;
  const src = audioCtx.createBufferSource();
  const g = audioCtx.createGain();
  g.gain.value = 0.28; // very subtle
  src.buffer = thinkingBuffer;
  src.connect(g); g.connect(playGain);
  src.onended = () => { thinkingSources = thinkingSources.filter((s) => s !== src); };
  src.start();
  thinkingSources.push(src);
}
function startThinkingCue() {
  stopThinkingCue();
  playThinkingOnce();
  thinkingTimer = setInterval(playThinkingOnce, 2800);
}
function stopThinkingCue() {
  if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; }
  thinkingSources.forEach((s) => { try { s.onended = null; s.stop(); } catch {} });
  thinkingSources = [];
}

// ============================================================ conversation kickoff
async function greet() {
  mode = 'thinking';
  setOrb('thinking');
  setStatus('JBIQ aa rahi hain…');
  startThinkingCue();
  try {
    const { reply, speech, state } = await chat([], sessionState);
    sessionState = state;
    updateLessonLabel();
    messages.push({ role: 'assistant', content: reply });
    addBubble('jbiq', reply);
    renderCards(reply);
    await speak(speech || reply);
  } catch (err) {
    console.error(err);
    fail('JBIQ se connect nahi ho paaya. Server chal raha hai? .env mein keys hain?');
    return;
  }
  if (running) enterListening();
}

// ============================================================ API
async function transcribe(blob) {
  const res = await fetch('/api/stt', {
    method: 'POST',
    headers: { 'Content-Type': blob.type || recMime },
    body: blob,
  });
  if (!res.ok) throw Object.assign(new Error('stt ' + res.status), { quota: res.status === 429 });
  return res.json();
}

async function chat(msgs, state) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: msgs, state }),
  });
  if (!res.ok) throw new Error('chat ' + res.status);
  return res.json();
}

// ============================================================ text helpers
const EN_MARKER = /\[\[EN:\s*([\s\S]*?)\]\]/g;

function splitIntoSpeakables(reply) {
  // protect [[EN: ...]] so sentence-splitting never cuts inside a phrase
  const held = [];
  const protectedText = reply.replace(EN_MARKER, (m) => {
    held.push(m);
    return `\uE000${held.length - 1}\uE000`;
  });
  const parts = protectedText
    .split(/(?<=[।.!?])\s+/)
    .map((p) => p.replace(/\uE000(\d+)\uE000/g, (_x, i) => held[+i]))
    .map((p) => p.trim())
    .filter((p) => /[a-zA-Zऀ-ॿ]/.test(p)); // must contain real letters
  // merge tiny fragments into the previous chunk
  const merged = [];
  for (const p of parts) {
    if (merged.length && p.replace(EN_MARKER, '$1').length < 14) {
      merged[merged.length - 1] += ' ' + p;
    } else {
      merged.push(p);
    }
  }
  return merged;
}

function extractPhrases(reply) {
  const out = [];
  let m;
  EN_MARKER.lastIndex = 0;
  while ((m = EN_MARKER.exec(reply))) out.push(m[1].trim());
  return out;
}

function esc(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// ============================================================ UI
function setStatus(t) { el.status.textContent = t; }
function setOrb(state) { el.orb.dataset.state = state; }

function addBubble(who, text) {
  const div = document.createElement('div');
  div.className = 'bubble ' + who;
  if (who === 'jbiq') {
    // show markers as highlighted English, strip the wrapper
    let html = '';
    let last = 0, m;
    EN_MARKER.lastIndex = 0;
    while ((m = EN_MARKER.exec(text))) {
      html += esc(text.slice(last, m.index));
      html += `<span class="en">${esc(m[1].trim())}</span>`;
      last = m.index + m[0].length;
    }
    html += esc(text.slice(last));
    div.innerHTML = html;
  } else {
    div.textContent = text;
  }
  el.transcript.appendChild(div);
  el.transcript.scrollTop = el.transcript.scrollHeight;
}

function renderCards(reply) {
  const phrases = extractPhrases(reply);
  el.cards.innerHTML = '';
  phrases.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'phrase-card';
    card.innerHTML =
      `<div class="pc-label">JBIQ ke baad boliye</div>` +
      `<div class="pc-en">${esc(p)}</div>` +
      `<div class="pc-hint">Ise dohraiye</div>`;
    el.cards.appendChild(card);
  });
}

function updateLessonLabel() {
  if (sessionState.phase === 'teaching') {
    el.lesson.textContent = [sessionState.situationName, sessionState.scenarioTitle]
      .filter(Boolean)
      .join(' · ');
  } else {
    el.lesson.textContent = '';
  }
}

// Voice (ElevenLabs) unavailable — usually quota. Fail loudly, not silently.
function voiceError() {
  if (voiceDown) return;
  voiceDown = true;
  stopThinkingCue();
  try { stopPlayback(); } catch {}
  try { if (recorder && recorder.state !== 'inactive') { recorder.onstop = null; recorder.stop(); } } catch {}
  mode = 'idle';
  setOrb('idle');
  setStatus('Awaaz abhi uplabdh nahi hai');
  el.cards.innerHTML =
    '<div class="error">🔇 Awaaz abhi uplabdh nahi hai. Thodi der baad dobara koshish karein.</div>';
}

function fail(msg) {
  stopThinkingCue();
  setOrb('idle');
  const div = document.createElement('div');
  div.className = 'error';
  div.textContent = msg;
  el.transcript.appendChild(div);
  setStatus('');
  el.start.hidden = false;
  el.stop.hidden = true;
}
