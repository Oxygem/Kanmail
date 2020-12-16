import bootApp from 'boot.jsx';
import SettingsApp from 'components/settings/SettingsApp.jsx';
import settingsStore from 'stores/settings.js';

bootApp(SettingsApp, 'div[data-settings-app]', () => ({
    settings: settingsStore.props.originalSettings,
}));
