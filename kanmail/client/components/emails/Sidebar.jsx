import React from 'react';
import PropTypes from 'prop-types';

import HeaderErrors from 'components/HeaderErrors.jsx';
import Tooltip from 'components/Tooltip.jsx';

import Filters from 'components/emails/Filters.jsx';
import FooterStatus from 'components/emails/FooterStatus.jsx';

import {
    openLicense,
    openMeta,
    openSend,
    makeDragElement,
    makeNoDragElement,
} from 'window.js';
import settingsStore from 'stores/settings.js';
import searchStore from 'stores/search.js';
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
                <header style={this.getHeaderStyles()} ref={makeDragElement}>
                    <HeaderErrors />
                    <div className="buttons">
                        <div className="logo">
                            <span>K-</span>
                            <i className="logo fa fa-envelope-o"></i>
                        </div>
                        <div>
                            <Tooltip text={<span>Search (<i className="fa fa-keyboard-o" /> /)</span>}>
                                <a
                                    className="search"
                                    onClick={searchStore.toggle}
                                    ref={makeNoDragElement}
                                >
                                    <i className="fa fa-search"></i>
                                </a>
                            </Tooltip>
                            <Tooltip text={<span>Compose (<i className="fa fa-keyboard-o" /> c)</span>}>
                                <a
                                    className="compose"
                                    onClick={openSend}
                                    ref={makeNoDragElement}
                                >
                                    <i className="fa fa-pencil-square-o"></i>
                                </a>
                            </Tooltip>
                        </div>
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
