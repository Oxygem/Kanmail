import React from 'react';
import PropTypes from 'prop-types';

import Filters from 'components/emails/Filters.jsx';
import SidebarHeader from 'components/emails/SidebarHeader.jsx';
import FooterStatus from 'components/emails/FooterStatus.jsx';

import settingsStore from 'stores/settings.js';
import { get } from 'util/requests.js';
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
                            onClick={() => get('/open-send')}
                        >
                            <i className="fa fa-pencil-square-o"></i>
                            New email
                        </a>
                    </div>
                </header>

                <Filters />

                <footer>
                    <a onClick={() => get('/open-link', {url: 'https://github.com/Fizzadar/kanmail'})}>
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
