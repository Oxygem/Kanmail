import React from 'react';
import PropTypes from 'prop-types';

import Filters from 'components/emails/Filters.jsx';
import SidebarHeader from 'components/emails/SidebarHeader.jsx';
import FooterStatus from 'components/emails/FooterStatus.jsx';

import { openLink, openWindow } from 'window.js';
import settingsStore from 'stores/settings.js';
import { subscribe } from 'stores/base.jsx';


@subscribe(settingsStore)
export default class Sidebar extends React.Component {
    static propTypes = {
        styleSettings: PropTypes.object.isRequired,
    }

    getHeaderStyles() {
        if (this.props.styleSettings.header_background) {
            return {
                background: this.props.styleSettings.header_background,
            };
        }
    }

    openSend = () => {
        openWindow('/send', {
            title: 'Kanmail: compose email',
            width: 800,
            height: 600,
        });
    }

    render() {
        return (
            <section id="sidebar">
                <header style={this.getHeaderStyles()}>
                    <h1>
                        <span>K-</span>
                        <i className="logo fa fa-envelope-o"></i>
                        <SidebarHeader />
                    </h1>

                    <div>
                        <a
                            className="compose"
                            onClick={this.openSend}
                        >
                            <i className="fa fa-pencil-square-o"></i>
                            New email
                        </a>
                    </div>
                </header>

                <Filters />

                <footer>
                    <a onClick={() => openLink('https://github.com/Fizzadar/Kanmail')}>
                        Kanmail v{window.KANMAIL_VERSION}
                    </a>
                    {window.KANMAIL_DEBUG && ' (debug)'}
                    <br />
                    Beta

                    <FooterStatus />
                </footer>
            </section>
        );
    }
}
