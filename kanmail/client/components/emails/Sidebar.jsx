import React from 'react';
import PropTypes from 'prop-types';

import HeaderErrors from 'components/HeaderErrors.jsx';
import Filters from 'components/emails/Filters.jsx';
import FooterStatus from 'components/emails/FooterStatus.jsx';
import Search from 'components/emails/Search.jsx';

import {
    openLicense,
    openMeta,
    openWindow,
    makeDragElement,
    makeNoDragElement,
} from 'window.js';
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
        openWindow('/send', {title: 'Kanmail: compose email'});
    }

    render() {
        return (
            <section id="sidebar">
                <header style={this.getHeaderStyles()} ref={makeDragElement}>
                    <HeaderErrors />
                    <div className="search">
                        <Search />

                        <a
                            className="compose"
                            onClick={this.openSend}
                            ref={makeNoDragElement}
                        >
                            <i className="fa fa-pencil-square-o"></i>
                        </a>
                    </div>
                </header>

                <Filters />

                <footer>
                    <a onClick={openLicense}>
                        {window.KANMAIL_LICENSED ? 'Licensed': 'Unlicensed'}
                    </a> &middot; Beta<br />

                    <a onClick={openMeta}>
                        Kanmail v{window.KANMAIL_VERSION}
                    </a> {window.KANMAIL_DEBUG && '(debug)'}

                    <FooterStatus />
                </footer>
            </section>
        );
    }
}
