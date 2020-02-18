import React from 'react';
import PropTypes from 'prop-types';

import settingsStore from 'stores/settings.js';
import { subscribe } from 'stores/base.jsx';


@subscribe(settingsStore)
export default class HeaderBar extends React.Component {
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
            <header style={this.getHeaderStyles()}>
                <h1 id="logo">
                    <span>K-</span>
                    <i className="logo fa fa-envelope-o"></i>
                </h1>
            </header>
        );
    }
}
