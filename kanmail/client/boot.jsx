import React from 'react';
import ReactDOM from 'react-dom';

import 'fonts/fontawesome/css/font-awesome.css';
import 'fonts/roboto/css/roboto.css';
import 'fonts/roboto-slab/css/roboto-slab.css';
import 'style.less';

import ErrorBoundary from 'components/ErrorBoundary.jsx';

import settingsStore from 'stores/settings.js';

// ScrollIntoViewOptions support for Cocoa/WebKit
// Deep import for Edge: https://github.com/magic-akari/seamless-scroll-polyfill/issues/89
import { elementScrollIntoViewPolyfill } from 'seamless-scroll-polyfill/dist/es5/seamless.js';
elementScrollIntoViewPolyfill();


const bootApp = (Component, selector, getPropsFromElement=() => {}) => {
    const rootElement = document.querySelector(selector);
    if (!rootElement) {
        document.write('No root element found, exiting!');
        return;
    }

    const classNames = [window.KANMAIL_PLATFORM];
    if (window.KANMAIL_FRAMELESS) {
        classNames.push('frameless');
    }

    // Load the settings *then* bootstrap the app into the DOM
    settingsStore.getSettings().then(() => {
        const rootProps = getPropsFromElement(rootElement);
        console.debug('Settings loaded, bootstrapping app to DOM...');
        ReactDOM.render(<ErrorBoundary>
            <Component {...rootProps} />
        </ErrorBoundary>, rootElement);
    });
}
export default bootApp;
