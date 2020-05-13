import React from 'react';

import HeaderBar from 'components/HeaderBar.jsx';

import img from 'icon-pink.png';
import keyboard from 'keyboard.js';
import { openLink } from 'window.js';


export default class MetaApp extends React.Component {
    constructor(props) {
        super(props);

        keyboard.disable();
    }

    handleMetaUpdate = (ev) => {
        this.setState({
            license: ev.target.value,
        });
    }

    render() {
        return <div className="no-select">
            <HeaderBar />

            <section id="meta">
                <h2><img src={img} width="48px" /> Kanmail</h2>
                <p>
                    This is <a onClick={() => openLink(window.KANMAIL_WEBSITE_URL)}>
                        Kanmail v{window.KANMAIL_VERSION}
                    </a>.
                </p>
            </section>
        </div>;
    }
}
