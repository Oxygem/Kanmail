import { ISettings } from "./stores/settings.js";

export function setupThemes(settings: ISettings) {
  const darkModeMedia = window.matchMedia("(prefers-color-scheme: dark)");

  const setTheme = (ev) => {
    const darkTheme = settings.system.theme.dark || "theme-default-dark";
    const lightTheme = settings.system.theme.light || "theme-default";

    const urlParams = new URLSearchParams(window.location.search);
    const osClassName = "os-" + (urlParams.get("os") || "unknown")

    // Is dark mode?
    if (ev.matches) {
      document.body.className = `${darkTheme} ${osClassName}`;
    } else {
      document.body.className = `${lightTheme} ${osClassName}`;
    }
  };

  setTheme(darkModeMedia);

  if (darkModeMedia.addEventListener) {
    darkModeMedia.addEventListener("change", setTheme);
  } else {
    console.warn("Missing darkModeMedia.addEventListener, cannot sync with system theme")
  }
}
