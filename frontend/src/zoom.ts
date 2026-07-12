export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.5;
export const ZOOM_STEP = 0.1;

export function clampZoom(zoom: number): number {
  if (!zoom || Number.isNaN(zoom)) {
    return 1;
  }
  const rounded = Math.round(zoom * 100) / 100;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, rounded));
}

// CSS `zoom` (unlike `transform: scale`) triggers a real relayout, so text
// stays crisp. Applied to the document root so the whole UI - including
// rendered email - scales. Runs in every window on settings load, mirroring
// how themes are applied, so all windows stay in sync via SettingsChangedEvent.
export function applyZoom(zoom: number | undefined) {
  document.documentElement.style.setProperty("zoom", String(clampZoom(zoom ?? 1)));
}
