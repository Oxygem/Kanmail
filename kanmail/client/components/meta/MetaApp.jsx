import React from 'react';

import HeaderBar from 'components/HeaderBar.jsx';

import img from 'icon-pink.png';
import keyboard from 'keyboard.js';
import { openLink, openWindow } from 'window.js';


export default class MetaApp extends React.Component {
    constructor(props) {
        super(props);
        keyboard.disable();
    }

    render() {
        return <section className={`no-select ${window.KANMAIL_PLATFORM}`}>
            <HeaderBar />

            <section id="meta">
                <h2><img src={img} width="48px" /> Kanmail</h2>
                <p>
                    This is <a onClick={() => openLink(window.KANMAIL_WEBSITE_URL)}>
                        Kanmail v{window.KANMAIL_VERSION}
                    </a>.
                </p>
                <p>
                    <a onClick={() => openWindow('/meta-file/CHANGELOG.md')}>Changelog</a>
                    &nbsp;&bull;&nbsp;
                    <a onClick={() => openWindow('/meta-file/LICENSE.md')}>License</a>
                </p>
            </section>
        </section>;
    }
}
