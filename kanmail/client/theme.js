export function setupThemes(styleSettings) {
    const darkModeMedia = window.matchMedia('(prefers-color-scheme: dark)');

    const setTheme = (ev) => {
        let targetThemeName = styleSettings.theme_light;
        let otherThemeName = styleSettings.theme_dark;

        if (ev.matches) {
            targetThemeName = styleSettings.theme_dark;
            otherThemeName = styleSettings.theme_light;
        }
        document.body.classList.add(`theme-${targetThemeName}`);
        document.body.classList.remove(`theme-${otherThemeName}`);
    }

    setTheme(darkModeMedia);
    darkModeMedia.addEventListener('change', setTheme);
}
