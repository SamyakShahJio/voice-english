/**
 * CURRICULUM (grounding)
 * ----------------------
 * Ported from the original english.html experience. This is NOT a script.
 * It is *grounding*: when a learner's request maps to one of these scenarios,
 * the server injects that scenario's key phrases / rules / vocab / coaching
 * focus into JBIQ's situational prompt so her teaching is concrete and
 * consistent. When a learner asks for something NOT in here, JBIQ still
 * coaches it live — she just teaches from first principles instead.
 *
 * Situations = packs. Sub-situations = scenarios.
 */

export const PACKS = {
  office: {
    id: 'office',
    name: 'Workplace English',
    hindiName: 'ऑफ़िस / काम की अंग्रेज़ी',
    scenarios: {
      raise: {
        title: 'Ask for a raise',
        hindiTitle: 'सैलरी बढ़ाने की बात करना',
        keyPhrases: [
          "I'd like to discuss my contribution this year.",
          "Based on my impact, I'd like to discuss compensation.",
          "I've taken on additional responsibilities this quarter.",
          "I'm hoping we can revisit my package.",
        ],
        rules: [
          'Impact pehle, paisa baad mein — kabhi ulta nahi.',
          'Specific numbers do: "I closed 18 accounts", not "I worked hard".',
          'Calm tone rakho — request nahi, ek position state kar rahe ho.',
        ],
        vocab: [
          { word: 'Contribution', meaning: 'aapne team ko jo diya', example: "I'd like to discuss my contribution this year." },
          { word: 'Compensation', meaning: 'poora pay package (formal)', example: "I'd like to discuss compensation." },
          { word: 'Responsibilities', meaning: 'jin cheezon ke aap accountable ho', example: "I've taken on additional responsibilities." },
          { word: 'Revisit', meaning: 'dobara dekhna (professionally)', example: 'Can we revisit my package?' },
        ],
        coachingFocus: 'Pace slow (~130 wpm), no pleading tone. Watch the word "compensation" — learners swallow it; open the vowels: com-pen-SAY-shun.',
      },
      mistake: {
        title: 'Reporting a mistake',
        hindiTitle: 'अपनी ग़लती बताना',
        keyPhrases: [
          'I need to bring something to your attention.',
          'I made an error in the report yesterday.',
          "Here's what happened — and here's how I'm fixing it.",
          "It won't happen again.",
        ],
        rules: [
          'Shuruaat "I need to bring something to your attention" se — direct, ghabraye hue nahi.',
          'Pehle fix batao, phir apology. Manager solution sunna chahta hai.',
          'Zyada explain mat karo — teen line: kya hua, fix kya hai, aage kya.',
        ],
        vocab: [
          { word: 'Attention', meaning: 'dhyaan / notice (formal)', example: 'I need to bring something to your attention.' },
          { word: 'Error', meaning: 'ghalti (formal word)', example: 'I made an error in the report.' },
          { word: 'Accountable', meaning: 'zimmedari lena', example: "I'm accountable for this miss." },
        ],
        coachingFocus: 'Confident, steady tone. Avoid an over-apologetic rising pitch.',
      },
      meetings: {
        title: 'Speaking up in meetings',
        hindiTitle: 'मीटिंग में अपनी बात रखना',
        keyPhrases: [
          'I see your point, but here\'s another angle.',
          "I'd like to suggest a slightly different approach.",
          'What if we tried it this way instead?',
          'Let me add one thing to that.',
        ],
        rules: [
          'Pehle acknowledge karo, phir apni baat: "I see your point, but…".',
          'Suggest karo, demand nahi: "What if we…".',
          'Ek waqt mein ek idea — chhote turns.',
        ],
        vocab: [
          { word: 'Angle', meaning: 'nazariya / point of view', example: "Here's another angle." },
          { word: 'Approach', meaning: 'tareeka', example: 'a slightly different approach.' },
          { word: 'Align', meaning: 'ek direction pe agree hona', example: "Let's align on the next step." },
        ],
        coachingFocus: 'Encourage assertive but polite tone. Keep filler words ("umm", "actually") out of the opener.',
      },
    },
  },

  customer: {
    id: 'customer',
    name: 'Customer Service',
    hindiName: 'कस्टमर सर्विस',
    scenarios: {
      'angry-customer': {
        title: 'Calming an angry customer',
        hindiTitle: 'गुस्से में आए ग्राहक को शांत करना',
        keyPhrases: [
          'I completely understand your frustration.',
          'Let me look into this right away.',
          "I'll make sure this is resolved today.",
          'Thank you for your patience, sir.',
        ],
        rules: [
          'Pehle 5 words mein empathy — solution baad mein.',
          '"Sir please" ki jagah specific action: "let me look into this right away."',
          'Har reply ke end mein ek clear next step do.',
        ],
        vocab: [
          { word: 'Frustration', meaning: 'gussa / pareshani', example: 'I completely understand your frustration.' },
          { word: 'Resolve', meaning: 'problem theek karna', example: 'I will resolve this within the hour.' },
          { word: 'Patience', meaning: 'sabr', example: 'Thank you for your patience, sir.' },
          { word: 'Escalate', meaning: 'senior tak pahunchana', example: 'Before I escalate, give me 30 seconds.' },
        ],
        coachingFocus: 'Steady ~130 wpm even when the caller is loud. Watch "resolve" — say it as a fact, not a question (no rising tone).',
      },
      'return-policy': {
        title: 'Explaining a return policy',
        hindiTitle: 'रिटर्न पॉलिसी समझाना',
        keyPhrases: [
          'Our return policy is 30 days from purchase.',
          'Let me walk you through the steps.',
          "You'll need the original receipt.",
        ],
        rules: [
          'Calm, factual tone — jaise ek helpful guide.',
          'Ownership lo: "let me walk you through the steps."',
        ],
        vocab: [
          { word: 'Policy', meaning: 'niyam / rule', example: 'Our return policy is 30 days.' },
          { word: 'Receipt', meaning: 'bill / rasid', example: "You'll need the original receipt." },
        ],
        coachingFocus: 'Clear enunciation of numbers and "receipt" (ri-SEET, silent p).',
      },
    },
  },

  travel: {
    id: 'travel',
    name: 'English for travel',
    hindiName: 'सफ़र की अंग्रेज़ी',
    scenarios: {
      'airport-checkin': {
        title: 'Airport check-in',
        hindiTitle: 'एयरपोर्ट चेक-इन',
        keyPhrases: [
          "I'd like to check in for my flight, please.",
          "Here's my passport and booking.",
          'Just one bag to check in.',
          'Could I get a window seat, please?',
        ],
        rules: [
          'Chhote, polite requests — "please" laga do.',
          'Documents dete waqt kya de rahe ho, bol do.',
        ],
        vocab: [
          { word: 'Check in', meaning: 'flight ke liye register karna', example: "I'd like to check in, please." },
          { word: 'Boarding pass', meaning: 'plane mein chadhne ka pass', example: 'Here is your boarding pass.' },
          { word: 'Aisle / Window', meaning: 'gali waali / khidki waali seat', example: 'Could I get a window seat?' },
        ],
        coachingFocus: 'Polite request intonation. "Aisle" is pronounced "eye-l" (silent s).',
      },
      'ordering-food': {
        title: 'Ordering at a restaurant',
        hindiTitle: 'रेस्टोरेंट में खाना ऑर्डर करना',
        keyPhrases: [
          "Could I see the menu, please?",
          "I'll have the ... , please.",
          'Is this dish spicy?',
          'Could we get the bill, please?',
        ],
        rules: [
          '"I\'ll have…" ordering ka natural tareeka hai.',
          'Sawaal poochne se mat daro — "Is this spicy?" bilkul theek hai.',
        ],
        vocab: [
          { word: 'Menu', meaning: 'khane ki list', example: 'Could I see the menu?' },
          { word: 'Bill / Check', meaning: 'payment ka hisaab', example: 'Could we get the bill?' },
        ],
        coachingFocus: 'Relaxed, friendly tone. Practise "I\'ll have" (contraction) so it flows.',
      },
    },
  },

  family: {
    id: 'family',
    name: 'Family / In-Laws',
    hindiName: 'परिवार / ससुराल',
    scenarios: {
      'in-laws': {
        title: 'Talking to in-laws in English',
        hindiTitle: 'ससुराल वालों से अंग्रेज़ी में बात',
        keyPhrases: [
          "It's lovely to see you.",
          'How have you been?',
          "I've heard so much about you.",
          'Please, make yourself comfortable.',
        ],
        rules: [
          'Warm aur short — pehla impression tone se banta hai.',
          'Sawaal wapas karo: "And how about you?"',
        ],
        vocab: [
          { word: 'Lovely', meaning: 'bahut accha / pyaara', example: "It's lovely to see you." },
          { word: 'Comfortable', meaning: 'aaram se', example: 'Make yourself comfortable.' },
        ],
        coachingFocus: 'Warm, unhurried delivery. "Comfortable" = KUMF-ta-bul (3 syllables, not 4).',
      },
    },
  },

  dating: {
    id: 'dating',
    name: 'Dating',
    hindiName: 'डेटिंग',
    scenarios: {
      'first-date': {
        title: 'First date small talk',
        hindiTitle: 'पहली डेट पर बातचीत',
        keyPhrases: [
          'So, what do you enjoy doing on weekends?',
          "That sounds fun — tell me more.",
          "I've had a really nice time.",
          'Would you like to do this again?',
        ],
        rules: [
          'Open questions poochho — haan/na waale nahi.',
          'Interest dikhao: "tell me more."',
        ],
        vocab: [
          { word: 'Enjoy', meaning: 'maza aana / pasand karna', example: 'What do you enjoy doing?' },
          { word: 'Nice time', meaning: 'accha waqt', example: "I've had a really nice time." },
        ],
        coachingFocus: 'Light, relaxed pace. Encourage genuine curiosity in the intonation.',
      },
    },
  },
};

/** A compact catalogue JBIQ can reason over during onboarding. */
export function catalogueForPrompt() {
  return Object.values(PACKS)
    .map((pack) => {
      const scs = Object.entries(pack.scenarios)
        .map(([id, s]) => `      - ${id}: ${s.title} (${s.hindiTitle})`)
        .join('\n');
      return `  ${pack.id}: ${pack.name} (${pack.hindiName})\n${scs}`;
    })
    .join('\n');
}

/** Look up a scenario's grounding, tolerant of loose ids. */
export function findScenario(situationId, scenarioId) {
  const pack = PACKS[situationId];
  if (!pack) return null;
  const sc = pack.scenarios[scenarioId];
  if (!sc) return null;
  return { pack, scenario: sc, scenarioId };
}

/** Build the situational grounding block injected once a scenario is chosen. */
export function groundingBlock(situationId, scenarioId) {
  const found = findScenario(situationId, scenarioId);
  if (!found) return null;
  const { pack, scenario } = found;
  const phrases = scenario.keyPhrases.map((p) => `  • "${p}"`).join('\n');
  const rules = scenario.rules.map((r) => `  • ${r}`).join('\n');
  const vocab = scenario.vocab
    .map((v) => `  • ${v.word} — ${v.meaning} — e.g. "${v.example}"`)
    .join('\n');
  return `SITUATION: ${pack.name} — ${scenario.title}

Target English phrases to teach (model these exactly, in English):
${phrases}

The 3 rules for this scenario (explain in Hindi):
${rules}

Key vocabulary (word — meaning in Hindi — English example):
${vocab}

Coaching focus for this scenario:
  ${scenario.coachingFocus}`;
}
