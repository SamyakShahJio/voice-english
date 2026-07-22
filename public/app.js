/**
 * JBIQ — Jobs, Careers & Skills — voice-first client.
 * Voice carries intent + dialogue; the screen renders what the conversation
 * produced (use-case cards, word of the day, phrase cues, drafts). Screen never
 * initiates. Three UI densities (full / cards / voice) × zero/returning state.
 */

// ---- tunables ----
const SILENCE_MS = 900, SPEECH_ONSET_MS = 150, NO_INPUT_MS = 9000;
const BARGE_MIN_MS = 400, BARGE_GUARD_MS = 500, ENABLE_BARGE_IN = true;

const SUPPORTED_LANGS = ['hi-IN','ta-IN','bn-IN','te-IN','mr-IN','gu-IN','kn-IN','ml-IN','pa-IN','od-IN'];

const USE_CASES = [
  { id: 'english',       icon: '🗣️', name: 'English Learning', tag: 'Bol-chaal ki English, real situations', live: true },
  { id: 'interview',     icon: '💼', name: 'Interview Prep',    tag: 'Mock interviews, confident answers', live: false },
  { id: 'govtexam',      icon: '📚', name: 'Govt-Exam Prep',    tag: 'Sahi exam dhoondho, tayari karo', live: false },
  { id: 'microlearning', icon: '⚡', name: 'Micro-Learning',    tag: 'Roz 5 minute, ek nayi skill', live: false },
];

const WORDS = [
  { word: 'Confident', mean: 'aatmavishwaas se bhara', ex: 'She looked confident in the meeting.' },
  { word: 'Grateful',  mean: 'shukraguzaar / aabhaari', ex: 'I am grateful for your help.' },
  { word: 'Deadline',  mean: 'kaam poora karne ki aakhri taareekh', ex: 'The deadline is on Friday.' },
  { word: 'Polite',    mean: 'vinamr / tehzeeb waala', ex: 'Please be polite to the customer.' },
  { word: 'Available', mean: 'uplabdh / khaali (time)', ex: 'Are you available tomorrow?' },
];

// ---- element refs ----
const el = {
  orb: document.getElementById('orb'), status: document.getElementById('status'),
  shell: document.getElementById('shell'), useCases: document.getElementById('useCases'),
  wordDay: document.getElementById('wordDay'), cards: document.getElementById('cards'),
  drafts: document.getElementById('drafts'), transcript: document.getElementById('transcript'),
  demo: document.getElementById('demoToggle'),
  start: document.getElementById('startBtn'), stop: document.getElementById('stopBtn'),
  photo: document.getElementById('photoBtn'), photoInput: document.getElementById('photoInput'),
};

// ---- mode (UI density) — switchable IN PLACE, never resets the session ----
let MODE = (() => {
  const m = new URLSearchParams(location.search).get('mode');
  return ['full','cards','voice'].includes(m) ? m : 'full';
})();
document.body.dataset.mode = MODE;
let lastReply = '';
function setMode(m) {
  if (!['full','cards','voice'].includes(m) || m === MODE) return;
  MODE = m;
  document.body.dataset.mode = MODE;
  const url = new URL(location.href); url.searchParams.set('mode', m); history.replaceState(null, '', url);
  document.querySelectorAll('#modeTabs a').forEach((a) => a.classList.toggle('active', a.dataset.mode === MODE));
  renderScreen(lastReply); // re-render current screen for the new density; convo continues
}

// ---- profile (localStorage) + session ----
function loadProfile() { try { return JSON.parse(localStorage.getItem('jbiq_profile') || 'null'); } catch { return null; } }
function saveProfile(p) { try { localStorage.setItem('jbiq_profile', JSON.stringify(p)); } catch {} }
function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }

const stored = loadProfile();
const today = new Date().toISOString().slice(0, 10);
let profile = stored ? { ...stored } : { streakDays: 0, language: 'hi-IN' };
if (stored) {
  const d = daysBetween(stored.lastActiveDate || today, today);
  if (d === 1) profile.streakDays = (stored.streakDays || 1) + 1;
  else if (d > 1) profile.streakDays = 1; // streak reset after a gap
} else {
  profile.streakDays = 1;
}
profile.lastActiveDate = today;

let session = {
  phase: 'orientation',
  language: profile.language || 'hi-IN',
  proficiency: profile.proficiency || null,
  profile: stored ? {
    returning: true, name: profile.name, proficiency: profile.proficiency,
    language: profile.language, streakDays: profile.streakDays, lastSummary: profile.lastSummary,
  } : { returning: false },
};
let messages = [];
let running = false, voiceDown = false;

function persist() {
  profile.language = session.language;
  profile.proficiency = session.proficiency || profile.proficiency;
  profile.useCase = session.useCase || profile.useCase;
  if (session.scenarioTitle) profile.lastSummary = `"${session.scenarioTitle}" par kaam kiya`;
  saveProfile(profile);
}

// ---- audio graph / VAD ----
let audioCtx, analyser, micStream, playGain, timeData, recorder, recChunks = [], recMime = 'audio/webm';
let mode = 'idle', noiseFloor = 0.006, speechThreshold = 0.015, bargeThreshold = 0.03;
let hasSpoken = false, voiceFrames = 0, bargeFrames = 0;
let listenStartTs = 0, lastVoiceTs = 0, speakStartTs = 0, noInputTries = 0;
let currentSource = null, bargedIn = false;

// ============================================================ boot
el.start.addEventListener('click', start);
el.stop.addEventListener('click', stop);
// Demo toggle: jump between first-time (New) and returning user.
el.demo.querySelector('[data-demo="new"]').classList.toggle('on', !session.profile.returning);
el.demo.querySelector('[data-demo="ret"]').classList.toggle('on', session.profile.returning);
el.demo.addEventListener('click', (e) => {
  const b = e.target.closest('[data-demo]'); if (!b) return;
  if (b.dataset.demo === 'new') { localStorage.removeItem('jbiq_profile'); }
  else {
    saveProfile({ returning: true, proficiency: 'some', language: 'hi-IN', streakDays: 3,
      lastActiveDate: today, lastSummary: '"Ask for a raise" par kaam kiya', useCase: 'english' });
  }
  location.href = location.pathname + location.search;
});
el.photo.addEventListener('click', () => el.photoInput.click());
el.photoInput.addEventListener('change', onPhoto);
document.querySelectorAll('#modeTabs a').forEach((a) => {
  if (a.dataset.mode === MODE) a.classList.add('active');
  a.addEventListener('click', (e) => { e.preventDefault(); setMode(a.dataset.mode); });
});
// Streak lives in JBIQ's VOICE, not on screen (retention is spoken).
renderUseCases();
start();

function ensureAudioRunning() {
  if (audioCtx.state === 'running') return Promise.resolve();
  setStatus('Sunne ke liye taiyaar — kahin bhi tap karein');
  return new Promise((resolve) => {
    const go = async () => { window.removeEventListener('pointerdown', go); window.removeEventListener('keydown', go); try { await audioCtx.resume(); } catch {} resolve(); };
    window.addEventListener('pointerdown', go); window.addEventListener('keydown', go);
  });
}

async function start() {
  if (running) return;
  el.start.disabled = true;
  setStatus('Microphone allow kar rahe hain…');
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch { fail('Microphone allow karna zaroori hai. Browser settings mein permission dijiye.'); el.start.disabled = false; return; }

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  try { await audioCtx.resume(); } catch {}
  const src = audioCtx.createMediaStreamSource(micStream);
  analyser = audioCtx.createAnalyser(); analyser.fftSize = 1024; timeData = new Float32Array(analyser.fftSize);
  src.connect(analyser);
  playGain = audioCtx.createGain(); playGain.connect(audioCtx.destination);
  loadThinkingChime();

  recMime = pickMime(); running = true; el.start.hidden = true; el.stop.hidden = false;
  requestAnimationFrame(tick);
  await ensureAudioRunning();
  await calibrate();
  await greet();
}

function stop() {
  running = false; stopThinkingCue();
  try { stopPlayback(); } catch {}
  try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch {}
  try { micStream && micStream.getTracks().forEach((t) => t.stop()); } catch {}
  try { audioCtx && audioCtx.close(); } catch {}
  mode = 'idle'; setOrb('idle'); setStatus('Rok diya. Dobara shuru karein?');
  el.stop.hidden = true; el.start.hidden = false; el.start.disabled = false;
}

function pickMime() {
  const c = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'];
  return c.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || 'audio/webm';
}

async function calibrate() {
  setStatus('Ek pal…'); const samples = []; const until = performance.now() + 450;
  await new Promise((r) => { const id = setInterval(() => { samples.push(readRMS()); if (performance.now() > until) { clearInterval(id); r(); } }, 20); });
  const avg = samples.reduce((a, b) => a + b, 0) / Math.max(samples.length, 1);
  noiseFloor = avg || 0.006; speechThreshold = Math.max(0.012, noiseFloor * 3.5); bargeThreshold = Math.max(0.025, noiseFloor * 6);
}

function readRMS() { analyser.getFloatTimeDomainData(timeData); let s = 0; for (let i = 0; i < timeData.length; i++) s += timeData[i] * timeData[i]; return Math.sqrt(s / timeData.length); }

function tick() {
  if (!running) return; requestAnimationFrame(tick);
  const rms = readRMS(), now = performance.now();
  if (mode === 'listening') {
    el.orb.style.setProperty('--level', Math.min(rms / 0.12, 1).toFixed(3));
    if (rms > speechThreshold) { lastVoiceTs = now; voiceFrames++; if (!hasSpoken && voiceFrames * 16 >= SPEECH_ONSET_MS) hasSpoken = true; }
    else voiceFrames = 0;
    if (hasSpoken && now - lastVoiceTs > SILENCE_MS) endUserTurn();
    else if (!hasSpoken && now - listenStartTs > NO_INPUT_MS) handleNoInput();
  } else if (mode === 'speaking' && ENABLE_BARGE_IN) {
    if (now - speakStartTs > BARGE_GUARD_MS) {
      if (rms > bargeThreshold) { bargeFrames++; if (bargeFrames * 16 >= BARGE_MIN_MS) doBargeIn(); }
      else bargeFrames = 0;
    }
  }
}

function enterListening() {
  if (!running || voiceDown) return;
  stopThinkingCue(); mode = 'listening'; hasSpoken = false; voiceFrames = 0;
  listenStartTs = lastVoiceTs = performance.now(); setOrb('listening'); setStatus('Boliye… sun rahi hoon');
  recChunks = [];
  try { recorder = new MediaRecorder(micStream, { mimeType: recMime }); } catch { recorder = new MediaRecorder(micStream); }
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
  recorder.start(100);
}

function endUserTurn() {
  if (mode !== 'listening') return;
  mode = 'thinking'; setOrb('thinking'); setStatus('Samajh rahi hoon…'); startThinkingCue();
  const rec = recorder;
  if (rec && rec.state !== 'inactive') { rec.onstop = () => handleUserTurn(new Blob(recChunks, { type: recMime })); rec.stop(); }
}

async function handleNoInput() {
  if (mode !== 'listening') return; noInputTries++; mode = 'thinking';
  try { if (recorder && recorder.state !== 'inactive') { recorder.onstop = null; recorder.stop(); } } catch {}
  if (noInputTries > 2) { setStatus('Jab taiyaar hon, boliye.'); noInputTries = 0; enterListening(); return; }
  startThinkingCue();
  const transient = messages.concat({ role: 'user', content: '[learner abhi tak chup hai — unhe pyaar se ek chhoti line mein dobara bulao]' });
  try { const { reply, speech, state } = await chat(transient, session); session = state; addBubble('jbiq', reply); await speak(speech || reply); } catch (e) { console.error(e); }
  if (running && !bargedIn) enterListening();
}

// ============================================================ turns
async function handleUserTurn(blob) {
  if (blob.size < 1200) { if (running) enterListening(); return; }
  let stt;
  try { stt = await transcribe(blob); }
  catch (err) { console.error(err); if (err && err.quota) { voiceError(); return; } setStatus('Sunne mein dikkat, dobara boliye.'); if (running) enterListening(); return; }
  const text = (stt.text || '').trim();
  if (!text) { if (running) enterListening(); return; }
  // multi-Indic: adopt the detected language if supported
  if (stt.language && SUPPORTED_LANGS.includes(stt.language)) session.language = stt.language;
  noInputTries = 0;
  const modelContent = text + confidenceNote(stt.words || []);
  await sendToBrain(text, modelContent);
}

/** From taps / photo (no STT). */
async function sendToBrain(displayText, modelContent) {
  if (displayText) addBubble('user', displayText);
  messages.push({ role: 'user', content: modelContent || displayText });
  mode = 'thinking'; setOrb('thinking'); setStatus('Samajh rahi hoon…'); startThinkingCue();
  let reply, speech, state;
  try { ({ reply, speech, state } = await chat(messages, session)); }
  catch (err) { console.error(err); stopThinkingCue(); setStatus('JBIQ se connect nahi ho paaya.'); if (running) enterListening(); return; }
  session = state; persist();
  messages.push({ role: 'assistant', content: reply });
  addBubble('jbiq', reply);
  renderScreen(reply);
  await speak(speech || reply);
  if (running && !bargedIn) enterListening(); // barge-in already re-opened the mic
}

function confidenceNote(words) {
  const low = words.filter((w) => w.logprob < -1.2 && /[a-zA-Z]/.test(w.text)).map((w) => w.text.replace(/[^a-zA-Z']/g, '')).filter(Boolean).slice(0, 6);
  return low.length ? `\n\n[coach note — learner's least-clear words: ${low.join(', ')}]` : '';
}

// ============================================================ speaking (TTS)
async function speak(text) {
  const chunks = splitIntoSpeakables(text);
  if (!chunks.length) return;
  bargedIn = false; bargeFrames = 0; mode = 'speaking'; stopThinkingCue();
  speakStartTs = performance.now(); setOrb('speaking'); setStatus('JBIQ bol rahi hain…');
  const clips = new Array(chunks.length); clips[0] = fetchClip(chunks[0]);
  for (let i = 0; i < chunks.length; i++) {
    if (i + 1 < chunks.length) clips[i + 1] = fetchClip(chunks[i + 1]);
    let buf; try { buf = await clips[i]; } catch (err) { if (err && err.quota) { voiceError(); return; } console.error('tts', err); continue; }
    if (bargedIn || !running) break;
    speakStartTs = performance.now(); await playBuffer(buf);
    if (bargedIn || !running) break;
  }
}
async function fetchClip(text) {
  const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, language: session.language }) });
  if (!res.ok) throw Object.assign(new Error('tts ' + res.status), { quota: res.status === 429 });
  return await audioCtx.decodeAudioData(await res.arrayBuffer());
}
function playBuffer(buf) { return new Promise((resolve) => { const s = audioCtx.createBufferSource(); s.buffer = buf; s.connect(playGain); s.onended = () => { if (currentSource === s) currentSource = null; resolve(); }; currentSource = s; s.start(); }); }
function stopPlayback() { if (currentSource) { try { currentSource.onended = null; currentSource.stop(); } catch {} currentSource = null; } }
function doBargeIn() { if (mode !== 'speaking') return; bargedIn = true; stopPlayback(); enterListening(); }

// thinking chime
let thinkingBuffer = null, thinkingTimer = null, thinkingSources = [];
async function loadThinkingChime() { if (thinkingBuffer || !audioCtx) return; try { thinkingBuffer = await audioCtx.decodeAudioData(await (await fetch('/thinking.wav')).arrayBuffer()); } catch {} }
function playThinkingOnce() {
  if (!audioCtx || audioCtx.state !== 'running' || !thinkingBuffer) return;
  const s = audioCtx.createBufferSource(), g = audioCtx.createGain(); g.gain.value = 0.28; s.buffer = thinkingBuffer;
  s.connect(g); g.connect(playGain); s.onended = () => { thinkingSources = thinkingSources.filter((x) => x !== s); }; s.start(); thinkingSources.push(s);
}
function startThinkingCue() { stopThinkingCue(); playThinkingOnce(); thinkingTimer = setInterval(playThinkingOnce, 2800); }
function stopThinkingCue() { if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; } thinkingSources.forEach((s) => { try { s.onended = null; s.stop(); } catch {} }); thinkingSources = []; }

// ============================================================ kickoff
async function greet() {
  mode = 'thinking'; setOrb('thinking'); setStatus('JBIQ aa rahi hain…'); startThinkingCue();
  try {
    const { reply, speech, state } = await chat([], session);
    session = state; persist();
    messages.push({ role: 'assistant', content: reply });
    addBubble('jbiq', reply); renderScreen(reply);
    await speak(speech || reply);
  } catch (err) { console.error(err); fail('JBIQ se connect nahi ho paaya. Server chal raha hai?'); return; }
  if (running && !bargedIn) enterListening();
}

// ============================================================ API
async function transcribe(blob) {
  const res = await fetch('/api/stt', { method: 'POST', headers: { 'Content-Type': blob.type || recMime }, body: blob });
  if (!res.ok) throw Object.assign(new Error('stt ' + res.status), { quota: res.status === 429 });
  return res.json();
}
async function chat(msgs, state) {
  const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: msgs, state, mode: MODE }) });
  if (!res.ok) throw new Error('chat ' + res.status);
  return res.json();
}

// ============================================================ photo → English
async function onPhoto(e) {
  const file = e.target.files && e.target.files[0]; el.photoInput.value = '';
  if (!file) return;
  setStatus('Photo padh rahi hoon…'); setOrb('thinking'); startThinkingCue();
  try {
    const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
    const r = await fetch('/api/vision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: b64, mediaType: file.type || 'image/jpeg' }) });
    const { extracted } = await r.json();
    stopThinkingCue();
    if (!extracted || /NO_ENGLISH/.test(extracted)) { await sendToBrain('📷 (photo bheji)', '[Learner ne ek photo bheji, par usme koi English text nahi mila. Unse poochho ki wo kya seekhna chahte hain.]'); return; }
    await sendToBrain('📷 (photo bheji)', `[Learner ne ek photo bheji. Usme yeh English likhi hai:\n"""${extracted}"""\nIse unki bhasha mein samjhaiye — matlab, aur 1-2 mushkil words. Unko padhna sikhaiye.]`);
  } catch (err) { console.error(err); stopThinkingCue(); setStatus('Photo padhne mein dikkat.'); if (running) enterListening(); }
}

// ============================================================ text helpers
const EN_MARKER = /\[\[EN:\s*([\s\S]*?)\]\]/g;
const DRAFT_MARKER = /\[\[DRAFT:\s*([\s\S]*?)\]\]/g;

function splitIntoSpeakables(text) {
  const held = [];
  const protectedText = text.replace(EN_MARKER, (m) => { held.push(m); return `${held.length - 1}`; }).replace(DRAFT_MARKER, ' ');
  const restore = (p) => p.replace(/(\d+)/g, (_x, i) => held[+i] !== undefined ? held[+i] : _x);
  return protectedText.split(/(?<=[।.!?])\s+/).map(restore).map((p) => p.trim()).filter((p) => /[a-zA-Zऀ-ॿ஀-௿ঀ-৿]/.test(p));
}
function extractPhrases(t) { const o = []; let m; EN_MARKER.lastIndex = 0; while ((m = EN_MARKER.exec(t))) o.push(m[1].trim()); return o; }
function extractDrafts(t) { const o = []; let m; DRAFT_MARKER.lastIndex = 0; while ((m = DRAFT_MARKER.exec(t))) o.push(m[1].trim()); return o; }
function esc(s) { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

// ============================================================ UI
function setStatus(t) { el.status.textContent = t; }
function setOrb(s) { el.orb.dataset.state = s; }

function addBubble(who, text) {
  // Always build the transcript (CSS hides it in cards/voice) so switching to
  // Full mid-conversation reveals the history — a clean hand-off.
  const div = document.createElement('div'); div.className = 'bubble ' + who;
  if (who === 'jbiq') {
    let html = '', last = 0, m; const t = text.replace(DRAFT_MARKER, '').trim(); EN_MARKER.lastIndex = 0;
    while ((m = EN_MARKER.exec(t))) { html += esc(t.slice(last, m.index)); html += `<span class="en">${esc(m[1].trim())}</span>`; last = m.index + m[0].length; }
    html += esc(t.slice(last)); div.innerHTML = html || esc(t);
  } else div.textContent = text;
  el.transcript.appendChild(div); el.transcript.scrollTop = el.transcript.scrollHeight;
}

function renderUseCases() {
  el.useCases.innerHTML = USE_CASES.map((u) => `
    <button class="usecase ${u.live ? 'live' : 'soon'}" data-uc="${u.id}">
      <span class="uc-badge">${u.live ? 'Live' : 'Soon'}</span>
      <div class="uc-icon">${u.icon}</div>
      <div class="uc-name">${u.name}</div>
      <div class="uc-tag">${u.tag}</div>
    </button>`).join('');
  el.useCases.querySelectorAll('.usecase').forEach((b) => b.addEventListener('click', () => {
    const uc = USE_CASES.find((x) => x.id === b.dataset.uc);
    sendToBrain(uc.name, uc.live ? `Main ${uc.name} karna chahta hoon.` : `Mujhe ${uc.name} chahiye — kya yeh available hai?`);
  }));
}

let wdIndex = 0;
function renderWordDay() {
  wdIndex = new Date().getDate() % WORDS.length; const w = WORDS[wdIndex];
  el.wordDay.hidden = false;
  el.wordDay.innerHTML = `
    <div class="wd-label">Word of the day</div>
    <div class="wd-word">${esc(w.word)}</div>
    <div class="wd-mean">${esc(w.mean)}</div>
    <div class="wd-ex">"${esc(w.ex)}"</div>
    <div class="wd-dots">${WORDS.map((_, i) => `<i class="${i === wdIndex ? 'on' : ''}"></i>`).join('')}</div>`;
  el.wordDay.onclick = () => sendToBrain('Aaj ka word sikhaiye', `Mujhe aaj ka "word of the day" — ${w.word} — sikhaiye.`);
}

function renderCards(reply) {
  if (MODE === 'voice') return;
  const phrases = extractPhrases(reply); el.cards.innerHTML = '';
  phrases.forEach((p) => {
    const card = document.createElement('div'); card.className = 'phrase-card';
    if (MODE === 'cards') {
      const w = p.split(/\s+/); const cue = w.slice(0, 3).join(' ') + (w.length > 3 ? ' …' : '');
      card.innerHTML = `<div class="pc-label">Aapko yeh kehna hai</div><div class="pc-en">${esc(cue)}</div><div class="pc-hint">${w.length} words · JBIQ ke baad</div>`;
    } else {
      card.innerHTML = `<div class="pc-label">JBIQ ke baad boliye</div><div class="pc-en">${esc(p)}</div><div class="pc-hint">Ise dohraiye</div>`;
    }
    el.cards.appendChild(card);
  });
}

function renderDrafts(reply) {
  const drafts = extractDrafts(reply);
  if (!drafts.length) { el.drafts.innerHTML = ''; return; }
  el.drafts.innerHTML = drafts.map((d) => `<div class="draft"><div class="df-label">Draft — tap to copy</div><div class="df-body">${esc(d)}</div><button class="df-copy">📋 Copy</button></div>`).join('');
  el.drafts.querySelectorAll('.draft').forEach((node, i) => node.querySelector('.df-copy').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(drafts[i]); node.querySelector('.df-copy').textContent = '✓ Copied'; }));
}

function renderScreen(reply) {
  if (reply !== undefined && reply !== null) lastReply = reply;
  reply = lastReply;
  const phase = session.phase;
  el.useCases.style.display = phase === 'orientation' ? '' : 'none';
  if (phase === 'english_onboarding') renderWordDay(); else el.wordDay.hidden = true;
  if (phase === 'english_teaching') renderCards(reply); else el.cards.innerHTML = '';
  renderDrafts(reply);
  el.photo.hidden = !(session.useCase === 'english');
}

function voiceError() {
  if (voiceDown) return; voiceDown = true; stopThinkingCue(); try { stopPlayback(); } catch {}
  try { if (recorder && recorder.state !== 'inactive') { recorder.onstop = null; recorder.stop(); } } catch {}
  mode = 'idle'; setOrb('idle'); setStatus('Awaaz abhi uplabdh nahi hai');
  el.drafts.innerHTML = '<div class="error">🔇 Awaaz abhi uplabdh nahi hai. Thodi der baad dobara koshish karein.</div>';
}
function fail(msg) {
  stopThinkingCue(); setOrb('idle');
  const d = document.createElement('div'); d.className = 'error'; d.textContent = msg; el.transcript.appendChild(d);
  setStatus(''); el.start.hidden = false; el.stop.hidden = true;
}
