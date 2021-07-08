import bootApp from 'boot.jsx';
import SettingsApp from 'components/settings/SettingsApp.jsx';
import settingsStore from 'stores/settings.js';

bootApp(SettingsApp, 'settings', () => ({
    settings: settingsStore.props.originalSettings,
    accountNameToConnected: settingsStore.props.accountNameToConnected,
}));
