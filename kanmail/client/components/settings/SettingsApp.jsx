import React from 'react';
import PropTypes from 'prop-types';

import HeaderBar from 'components/HeaderBar.jsx';

import keyboard from 'keyboard.js';
import { post } from 'util/requests.js';


export default class SettingsApp extends React.Component {
    static propTypes = {
        settings: PropTypes.object.isRequired,
    }

    constructor(props) {
        super(props);

        keyboard.disable();

        this.state = {
            settingsJson: JSON.stringify(this.props.settings, null, 4),
            error: null,
        };
    }

    handleSettingsChange = (ev) => {
        this.setState({
            settingsJson: ev.target.value,
        });
    }

    handleButtonClick = () => {
        let data;

        try {
            data = JSON.parse(this.state.settingsJson);
        } catch (e) {
            this.setState({
                error: e,
            });
            return;
        }

        data.reload = true;

        post('/api/settings', data).then(() => {
            window.close();
        });
    }

    render() {
        return (
            <section id="settings">
                <HeaderBar />

                <div>
                    <textarea
                        onChange={this.handleSettingsChange}
                        value={this.state.settingsJson}
                    ></textarea>

                    <button onClick={this.handleButtonClick}>
                        Save settings &rarr;
                        {this.state.error ? `(${this.state.error})` : ''}
                    </button>
                </div>
            </section>
        );
    }
}
