/**
 * The "Jobs, Careers & Skills" vertical.
 * One live use-case (English), three "coming soon". This registry is the
 * single source of truth the cold-start / orientation layer reasons over.
 */

export const VERTICAL = {
  id: 'jobs',
  name: 'Jobs, Careers & Skills',
};

export const USE_CASES = {
  english: {
    id: 'english',
    live: true,
    name: 'English Learning',
    tagline: 'Bol-chaal ki English, real situations ke liye',
    blurb: 'Situations practice, role-play, aur chhote tools — sab bol-kar.',
    icon: '🗣️',
  },
  interview: {
    id: 'interview',
    live: false,
    name: 'Interview Prep',
    tagline: 'Mock interviews, confident answers',
    blurb: 'Aa raha hai — jaldi hi.',
    icon: '💼',
  },
  govtexam: {
    id: 'govtexam',
    live: false,
    name: 'Govt-Exam Prep',
    tagline: 'Sahi exam dhoondho, tayari karo',
    blurb: 'Aa raha hai — jaldi hi.',
    icon: '📚',
  },
  microlearning: {
    id: 'microlearning',
    live: false,
    name: 'Micro-Learning',
    tagline: 'Roz 5 minute, ek nayi skill',
    blurb: 'Aa raha hai — jaldi hi.',
    icon: '⚡',
  },
};

export function liveUseCases() {
  return Object.values(USE_CASES).filter((u) => u.live);
}
export function comingSoonUseCases() {
  return Object.values(USE_CASES).filter((u) => !u.live);
}

/** A compact catalogue string for the cold-start orientation prompt. */
export function useCasesForPrompt() {
  return Object.values(USE_CASES)
    .map((u) => `  - ${u.id}: ${u.name} — ${u.tagline}${u.live ? ' [LIVE]' : ' [COMING SOON]'}`)
    .join('\n');
}
