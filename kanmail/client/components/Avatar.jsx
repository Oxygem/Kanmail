import React from 'react';
import PropTypes from 'prop-types';
import randomColor from 'randomcolor';

import settingsStore from 'stores/settings.js';


const emailToColorCache = {};


function getColorForAddress(address) {
    const email = address[1];
    if (!emailToColorCache[email]) {
        emailToColorCache[email] = randomColor();
    }
    return emailToColorCache[email];
}


function getInitialsFromAddress(address) {
    const text = address[0] || address[1];
    const textBits = text.split(' ');
    if (textBits.length > 1) {
        return `${textBits[0][0]}${textBits[1][0]}`;
    }

    const capitalOnlyText = text.replace(/[^A-Z]/g, '');
    if (capitalOnlyText.length) {
        return capitalOnlyText;
    }

    return text[0];
}

export default class Avatar extends React.Component {
    static propTypes = {
        address: PropTypes.array.isRequired,
    }

    constructor() {
        super();

        this.state = {
            hasIcon: settingsStore.props.systemSettings.load_contact_icons,
        };
    }

    checkIcon = (ev) => {
        if (ev.target.naturalHeight === 1) {
            this.setState({hasIcon: false});
        }
    }

    render() {
        const { address } = this.props;

        let image = null;
        if (settingsStore.props.systemSettings.load_contact_icons) {
            image = <img src={`/contact-icon/${address[1]}`} onLoad={this.checkIcon} />;
        }

        return (
            <div
                className="avatar"
                style={this.state.hasIcon ? {} : {background: getColorForAddress(address)}}
            >
                {image}
                {this.state.hasIcon || <span>{getInitialsFromAddress(address)}</span>}
            </div>
        );
    }
}