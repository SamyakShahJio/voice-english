/**
 * Claude — JBIQ's brain. Runs one conversational turn:
 *  - builds the system prompt from the current session state,
 *  - lets JBIQ optionally call begin_session (the onboarding slot-fill tool),
 *  - returns her spoken reply plus any updated session state.
 */

import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt, BEGIN_SESSION_TOOL } from './prompts/system.js';
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
const MAX_TOKENS = 600; // short turns, but each is emitted twice (roman + Devanagari)

/** Collapse Claude content blocks into plain text. */
function textOf(content) {
  return content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join(' ')
    .trim();
}

/**
 * JBIQ outputs each turn twice: the Roman/Latin half (shown on screen), then
 * `///SPOKEN///`, then the Devanagari half (spoken aloud so Hindi sounds
 * native). Split them; fall back to the same text for both if the marker is
 * missing.
 */
function splitDual(full) {
  const idx = full.indexOf('///SPOKEN///');
  if (idx === -1) return { reply: full.trim(), speech: full.trim() };
  const reply = full.slice(0, idx).trim();
  const speech = full.slice(idx + '///SPOKEN///'.length).trim();
  return { reply: reply || speech, speech: speech || reply };
}

/**
 * @param {Array}  messages  full conversation as [{role, content}] (content is string)
 * @param {object} state     current session state (see system.js)
 * @returns {Promise<{reply:string, state:object}>}
 */
export async function runTurn(messages, state = { phase: 'onboarding' }) {
  const api = anthropic();
  let workingState = { ...state };

  // Convert simple string messages into Anthropic message blocks.
  const convo = messages.map((m) => ({
    role: m.role,
    content: [{ type: 'text', text: m.content }],
  }));

  // First turn of a session: seed a control message so JBIQ greets and
  // begins onboarding (Anthropic requires a leading user message).
  if (convo.length === 0) {
    convo.push({
      role: 'user',
      content: [{ type: 'text', text: '[SESSION_START] — greet the learner in Hindi and begin onboarding.' }],
    });
  }

  // The tool is only offered during onboarding / topic switches.
  const tools = [BEGIN_SESSION_TOOL];

  // Up to two hops: first response may be a tool call, second is the spoken turn.
  for (let hop = 0; hop < 3; hop++) {
    const res = await api.messages.create({
      model: MODEL(),
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(workingState),
      tools,
      messages: convo,
    });

    const toolUse = res.content.find((b) => b.type === 'tool_use');

    if (toolUse && toolUse.name === 'begin_session') {
      const input = toolUse.input || {};
      const pack = PACKS[input.situationId];
      workingState = {
        ...workingState,
        phase: 'teaching',
        situationId: input.situationId,
        scenarioId: input.scenarioId,
        situationName: input.situationName || (pack && pack.name) || input.situationId,
        scenarioTitle: input.scenarioTitle || input.scenarioId,
        customTitle: pack && pack.scenarios[input.scenarioId] ? null : input.scenarioTitle,
        goal: input.goal || workingState.goal || '',
      };

      // Feed the tool result back so JBIQ continues in the SAME logical turn,
      // now under the teaching-phase system prompt.
      convo.push({ role: 'assistant', content: res.content });
      convo.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: 'Session locked. Now confirm warmly in Hindi and start teaching.',
          },
        ],
      });
      continue; // next hop produces the spoken reply
    }

    // No tool call → this is JBIQ's spoken turn.
    const { reply, speech } = splitDual(textOf(res.content) || 'Maaf kijiye, dobara boliye?');
    return { reply, speech, state: workingState };
  }

  return { reply: 'Chaliye, English pe wapas aate hain.', speech: 'चलिए, इंग्लिश पे वापस आते हैं।', state: workingState };
}
