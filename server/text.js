/**
 * Marker helpers. JBIQ wraps target English phrases as [[EN: ...]] so the
 * client can render them as on-screen practice cards. For TTS we strip the
 * markers but keep the phrase inline, so it's spoken naturally in one breath.
 */

const MARKER = /\[\[EN:\s*([\s\S]*?)\]\]/g;

/** Remove [[EN: ...]] wrappers, keeping the inner phrase. */
export function stripMarkers(text) {
  return String(text).replace(MARKER, (_m, inner) => inner.trim());
}

/**
 * Prepare text for the TTS engine: strip [[EN: ...]] wrappers, and spell the
 * brand name so it's pronounced as the letters J-B-I-Q. Rendered in Devanagari
 * ("जे बी आई क्यू") so it's voiced in the Hindi accent, not switched to English.
 */
export function speechText(text, language = 'hi-IN') {
  let out = stripMarkers(text).replace(/\[\[DRAFT:[\s\S]*?\]\]/g, ' '); // drafts are shown, not spoken in full
  // Spell the name so J-B-I-Q is voiced as letters. Devanagari for Hindi;
  // other languages keep the Latin letters (Sarvam voices the letters).
  if (language.startsWith('hi')) {
    out = out
      .replace(/जेबीआईक्यू/g, 'जे बी आई क्यू')
      .replace(/\bJBIQ\b/gi, 'जे बी आई क्यू');
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Pull out the wrapped English phrases (for on-screen cards). */
export function extractPhrases(text) {
  const out = [];
  let m;
  MARKER.lastIndex = 0;
  while ((m = MARKER.exec(text))) out.push(m[1].trim());
  return out;
}
