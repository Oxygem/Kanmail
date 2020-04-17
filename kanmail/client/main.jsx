import React from 'react';
import ReactDOM from 'react-dom';

import 'fonts/fontawesome/css/font-awesome.css';
import 'fonts/roboto/css/roboto.css';
import 'fonts/roboto-slab/css/roboto-slab.css';
import 'style.less';

import ErrorBoundary from 'components/ErrorBoundary.jsx';
import EmailsApp from 'components/emails/EmailsApp.jsx';
import SendApp from 'components/send/SendApp.jsx'
import SettingsApp from 'components/settings/SettingsApp.jsx';
import ContactsApp from 'components/contacts/ContactsApp.jsx';
import LicenseApp from 'components/license/LicenseApp.jsx';

import settingsStore from 'stores/settings.js';


const appRoot = document.querySelector('div[data-emails-app]');

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
            <SettingsApp settings={settings.originalSettings} />
        </ErrorBoundary>, settingsAppRoot);
    });
}


const contactsAppRoot = document.querySelector('div[data-contacts-app]');

if (contactsAppRoot) {
    // Load the settings *then* bootstrap the app into the DOM
    settingsStore.getSettings().then(() => {
        console.debug('Settings loaded, bootstrapping contacts app to DOM...');
        const contacts = JSON.parse(contactsAppRoot.getAttribute('data-contacts'));
        ReactDOM.render(<ErrorBoundary>
            <ContactsApp contacts={contacts} />
        </ErrorBoundary>, contactsAppRoot);
    });
}


const licenseAppRoot = document.querySelector('div[data-license-app]');

if (licenseAppRoot) {
    // Load the settings *then* bootstrap the app into the DOM
    settingsStore.getSettings().then(() => {
        console.debug('Settings loaded, bootstrapping license app to DOM...');
        ReactDOM.render(<ErrorBoundary>
            <LicenseApp />
        </ErrorBoundary>, licenseAppRoot);
    });
}
