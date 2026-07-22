/**
 * Claude — JBIQ's brain. Runs one conversational turn:
 *  - builds the system prompt from session state (phase, language, memory),
 *  - offers phase-appropriate tools (route / proficiency / begin_session),
 *  - returns the spoken reply (Roman + native-script split) and updated state.
 */

import Anthropic from '@anthropic-ai/sdk';
import { STATIC_SYSTEM, dynamicSystem, TOOLS } from './prompts/system.js';
import { PACKS } from './prompts/scenarios.js';

let client;
function anthropic() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const MODEL = () => process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const MAX_TOKENS = 320; // short turns (emitted twice: roman + native) — keeps latency low

const tool = (name) => TOOLS.find((t) => t.name === name);

/**
 * Photo-to-text: read an image and return the English text visible in it,
 * verbatim (for JBIQ to then explain in the learner's language).
 */
export async function readImage(base64, mediaType = 'image/jpeg') {
  const api = anthropic();
  const res = await api.messages.create({
    model: MODEL(),
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          {
            type: 'text',
            text: 'Transcribe ALL the English text visible in this image, verbatim, preserving line breaks. If there is no English text, reply exactly "NO_ENGLISH". Output only the transcription, nothing else.',
          },
        ],
      },
    ],
  });
  return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

function textOf(content) {
  return content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
}

/** Split "Roman ///SPOKEN/// native" into {reply (screen), speech (TTS)}. */
function splitDual(full) {
  const i = full.indexOf('///SPOKEN///');
  if (i === -1) return { reply: full.trim(), speech: full.trim() };
  const reply = full.slice(0, i).trim();
  const speech = full.slice(i + '///SPOKEN///'.length).trim();
  return { reply: reply || speech, speech: speech || reply };
}

/** Tools offered depend on the phase. */
function toolsFor(state) {
  if (state.phase === 'english_teaching') return [tool('begin_session')];
  if (state.phase === 'english_onboarding') return [tool('set_proficiency'), tool('begin_session')];
  return [tool('route_use_case')]; // orientation
}

/**
 * @param {Array}  messages  [{role, content}] (content is a string)
 * @param {object} state     session state (phase, useCase, language, proficiency, profile, situation…)
 * @param {string} mode      full | cards | voice
 */
export async function runTurn(messages, state = { phase: 'orientation' }, mode = 'full') {
  const api = anthropic();
  let s = { ...state };
  if (!s.phase) s.phase = 'orientation';

  const convo = messages.map((m) => ({ role: m.role, content: [{ type: 'text', text: m.content }] }));
  if (convo.length === 0) {
    convo.push({ role: 'user', content: [{ type: 'text', text: '[SESSION_START] — greet and orient the learner.' }] });
  }

  for (let hop = 0; hop < 4; hop++) {
    const tools = toolsFor(s).filter(Boolean);
    const res = await api.messages.create({
      model: MODEL(),
      max_tokens: MAX_TOKENS,
      system: [
        { type: 'text', text: STATIC_SYSTEM, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: dynamicSystem(s, mode) },
      ],
      ...(tools.length ? { tools } : {}),
      messages: convo,
    });

    const tu = res.content.find((b) => b.type === 'tool_use');
    if (tu) {
      let resultMsg = 'Done. Continue in the same turn.';
      if (tu.name === 'route_use_case') {
        const uc = (tu.input || {}).useCase;
        s.useCase = uc;
        if (uc === 'english') {
          s.phase = 'english_onboarding';
          resultMsg = 'Routed to English. Warmly begin onboarding now (gauge proficiency, offer activities).';
        } else {
          resultMsg = `"${uc}" is COMING SOON. Warmly say it is coming soon, that you will send a WhatsApp when ready, and offer to start English meanwhile.`;
        }
      } else if (tu.name === 'set_proficiency') {
        s.proficiency = (tu.input || {}).level;
        resultMsg = 'Proficiency noted. Continue — offer a first activity, tailored to it.';
      } else if (tu.name === 'begin_session') {
        const inp = tu.input || {};
        const pack = PACKS[inp.situationId];
        s = {
          ...s,
          phase: 'english_teaching',
          situationId: inp.situationId,
          scenarioId: inp.scenarioId,
          situationName: inp.situationName || (pack && pack.name) || inp.situationId,
          scenarioTitle: inp.scenarioTitle || inp.scenarioId,
          customTitle: pack && pack.scenarios[inp.scenarioId] ? null : inp.scenarioTitle,
          goal: inp.goal || s.goal || '',
        };
        resultMsg = 'Session locked. Confirm warmly and START teaching (frame + first phrase) now.';
      }
      convo.push({ role: 'assistant', content: res.content });
      convo.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: tu.id, content: resultMsg }] });
      continue;
    }

    const { reply, speech } = splitDual(textOf(res.content) || 'Maaf kijiye, dobara boliye?');
    return { reply, speech, state: s };
  }
  return { reply: 'Chaliye, aage badhte hain.', speech: 'चलिए, आगे बढ़ते हैं।', state: s };
}
