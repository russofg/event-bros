export function watchReducedMotion(
  matchMedia = window.matchMedia.bind(window),
  onChange = () => {},
) {
  const query = matchMedia("(prefers-reduced-motion: reduce)");
  const notify = () => onChange(query.matches);
  notify();
  query.addEventListener?.("change", notify);
  return () => query.removeEventListener?.("change", notify);
}
