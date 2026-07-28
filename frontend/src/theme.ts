import { ISettings } from "./stores/settings.js";
import systemStore from "./stores/system.js";

const LOCKED_THEMES = new Set([
  "theme-default-midnight-blue",
  "theme-default-matrix",
  "theme-default-nord-light",
]);

function resolveTheme(theme: string): string {
  // The old default/contrast theme was removed; map any saved value to light.
  if (theme === "theme-default") {
    theme = "theme-default-light";
  }
  if (LOCKED_THEMES.has(theme) && !systemStore.props.isLicensed) {
    return "theme-default-light";
  }
  return theme;
}

let currentSettings: ISettings | null = null;
let darkModeMedia: MediaQueryList | null = null;
let listenersAttached = false;

export function applyThemes() {
  if (!currentSettings || !darkModeMedia) {
    return;
  }

  const darkTheme = resolveTheme(currentSettings.system.theme.dark || "theme-default-dark");
  const lightTheme = resolveTheme(currentSettings.system.theme.light || "theme-default-light");

  const urlParams = new URLSearchParams(window.location.search);
  const osClassName = "os-" + (urlParams.get("os") || "unknown");

  if (darkModeMedia.matches) {
    document.body.className = `${darkTheme} ${osClassName}`;
  } else {
    document.body.className = `${lightTheme} ${osClassName}`;
  }
}

export function setupThemes(settings: ISettings) {
  currentSettings = settings;
  if (!darkModeMedia) {
    darkModeMedia = window.matchMedia("(prefers-color-scheme: dark)");
  }

  applyThemes();

  if (!listenersAttached) {
    if (darkModeMedia.addEventListener) {
      darkModeMedia.addEventListener("change", applyThemes);
    } else {
      console.warn("Missing darkModeMedia.addEventListener, cannot sync with system theme");
    }
    listenersAttached = true;
  }
}
