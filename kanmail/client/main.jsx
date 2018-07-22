import 'static/fontawesome/css/font-awesome.css';
import 'style.less';

import 'window';

import React from 'react';
import ReactDOM from 'react-dom';
import App from 'components/App.jsx';
import SendApp from 'components/SendApp.jsx'
import ErrorBoundary from 'components/ErrorBoundary.jsx';
import settingsStore from 'stores/settings.js';


const appRoot = document.querySelector('div[data-root-app]');

if (appRoot) {
    // Load the settings *then* bootstrap the app into the DOM
    settingsStore.getSettings().then(() => {
        console.debug('Settings loaded, bootstrapping app to DOM...');
        ReactDOM.render(<ErrorBoundary>
            <App />
        </ErrorBoundary>, appRoot);
    });
}


const sendAppRoot = document.querySelector('div[data-send-app]');

if (sendAppRoot) {
    console.debug('Boostrapping send app to DOM...');
    const reply = JSON.parse(sendAppRoot.getAttribute('data-reply'));
    ReactDOM.render(<ErrorBoundary>
        <SendApp message={reply.message} />
    </ErrorBoundary>, sendAppRoot);
}
