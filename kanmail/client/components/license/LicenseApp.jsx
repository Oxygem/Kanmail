import React from 'react';

import { closeWindow, openLink, makeDragElement } from 'window.js';

import { delete_, post } from 'util/requests.js';


export default class LicenseApp extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            license: '',
        };
    }

    handleLicenseUpdate = (ev) => {
        this.setState({
            license: ev.target.value,
        });
    }

    handleValidateLicense = (ev) => {
        ev.preventDefault();

        if (this.state.isSaving) {
            if (this.state.saveError) {
                this.setState({isSaving: false, saveError: null});
            }
            return;
        }

        this.setState({isSaving: true});

        post('/api/license', {license: this.state.license})
            .then(() => {
                closeWindow();
                this.setState({isSaved: true});
            })
            .catch(err => this.setState({saveError: err}));
    }

    handleRemoveLicense = (ev) => {
        ev.preventDefault();

        delete_('/api/license')
            .then(() => closeWindow())
            .catch(err => this.setState({saveError: err}));
    }

    renderSaveButton() {
        if (this.state.isSaving) {
            let text;
            const classes = ['main-button'];

            if (this.state.saveError) {
                text = `Error saving license: ${this.state.saveError.data.errorMessage}`;
                classes.push('inactive');
            } else if (this.state.isSaved) {
                text = 'Licensed saved, please close this window & reload the main one';
                classes.push('disabled');
            } else {
                text = 'Saving...';
                classes.push('disabled');
            }

            return (
                <button
                    type="submit"
                    className={classes.join(' ')}
                    onClick={this.handleValidateLicense}
                >{text}</button>
            );
        }

        return (
            <button
                type="submit"
                className="main-button submit"
                onClick={this.handleValidateLicense}
            >Validate license key &rarr;</button>
        );
    }

    renderContent() {
        if (window.KANMAIL_LICENSED) {
            return (
                <div>
                    <p>Thank you for purchasing a Kanmail license!</p>
                    <p>Kanmail is licensed to: <strong>{window.KANMAIL_LICENSE_EMAIL}</strong></p>
                    <form>
                        <button
                            type="submit"
                            className="main-button cancel"
                            onClick={this.handleRemoveLicense}
                        >Remove license</button>
                    </form>
                </div>
            );
        }

        return (
            <div>
                <p>Hello Kanmail user! Kanmail is developed by a tiny team and a single license key purchase goes a long way. If you use Kanmail regularly and get value out of it, please consider <a onClick={() => openLink(`${window.KANMAIL_WEBSITE_URL}/license`)}>purchasing a license</a>.</p>
                <form>
                    <textarea
                        placeholder="Paste license here"
                        value={this.state.license}
                        onChange={this.handleLicenseUpdate}
                    ></textarea>

                    {this.renderSaveButton()}
                </form>
            </div>
        );
    }

    render() {
        return <section className="no-select">
            <header className="meta header-bar" ref={makeDragElement}>
                <h2>Manage License</h2>
            </header>

            <section id="license">
                <h2>Kanmail License</h2>
                {this.renderContent()}
            </section>
        </section>;
    }
}
