import React from 'react';
import ReactDOM from 'react-dom';

import 'static/fontawesome/css/font-awesome.css';
import 'style.less';

import ErrorBoundary from 'components/ErrorBoundary.jsx';
import EmailsApp from 'components/emails/EmailsApp.jsx';
import SendApp from 'components/send/SendApp.jsx'
import SettingsApp from 'components/settings/SettingsApp.jsx';

import settingsStore from 'stores/settings.js';


const appRoot = document.querySelector('div[data-root-app]');

if (appRoot) {
    // Load the settings *then* bootstrap the app into the DOM
    settingsStore.getSettings().then(() => {
        console.debug('Settings loaded, bootstrapping app to DOM...');
        ReactDOM.render(<ErrorBoundary>
            <EmailsApp />
        </ErrorBoundary>, appRoot);
    });
}


const sendAppRoot = document.querySelector('div[data-send-app]');

if (sendAppRoot) {
    settingsStore.getSettings().then(() => {
        console.debug('Boostrapping send app to DOM...');
        const contacts = JSON.parse(sendAppRoot.getAttribute('data-contacts'));
        const reply = JSON.parse(sendAppRoot.getAttribute('data-reply'));
        ReactDOM.render(<ErrorBoundary>
            <SendApp message={reply} contacts={contacts} />
        </ErrorBoundary>, sendAppRoot);
    });
}


const settingsAppRoot = document.querySelector('div[data-settings-app]');

if (settingsAppRoot) {
    // Load the settings *then* bootstrap the app into the DOM
    settingsStore.getSettings().then(settings => {
        console.debug('Settings loaded, bootstrapping settings app to DOM...');
        ReactDOM.render(<ErrorBoundary>
            <SettingsApp settings={settings} />
        </ErrorBoundary>, settingsAppRoot);
    });
}
