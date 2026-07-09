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

/** Pull out the wrapped English phrases (for on-screen cards). */
export function extractPhrases(text) {
  const out = [];
  let m;
  MARKER.lastIndex = 0;
  while ((m = MARKER.exec(text))) out.push(m[1].trim());
  return out;
}
