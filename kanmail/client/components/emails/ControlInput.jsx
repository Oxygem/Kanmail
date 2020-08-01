import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';
import Select from 'react-select';

import keyboard from 'keyboard.js';

import controlStore from 'stores/control.js';
import folderStore from 'stores/folders.js';
import { getEmailStore } from 'stores/emailStoreProxy.js';
import { subscribe } from 'stores/base.jsx';

import { capitalizeFirstLetter } from 'util/string.js';


@subscribe(folderStore)
class ControlInput extends React.Component {
    static propTypes = {
        folders: PropTypes.array.isRequired,
        action: PropTypes.string,
        subject: PropTypes.string,
        moveData: PropTypes.object,
    }

    handleSelectChange = (value) => {
        const { messageUids, oldColumn, accountName } = this.props.moveData;
        const emailStore = getEmailStore();

        let handler = emailStore.moveEmails;
        if (this.props.action === 'copy') {
            handler = emailStore.copyEmails;
        }

        handler(
            accountName,
            messageUids,
            oldColumn,
            value.value,
        ).then(() => {
            emailStore.syncFolderEmails(
                oldColumn,
                {accountName: accountName},
            );
            emailStore.syncFolderEmails(
                value.value,
                {
                    accountName: accountName,
                    // Tell the backend to expect X messages (and infer if needed!)
                    query: {uid_count: messageUids.length},
                },
            );
        });

        this.handleClose();
    }

    handleClose = () => {
        controlStore.close();
        setTimeout(keyboard.enable, 0);
    }

    render () {
        const folderOptions = _.map(this.props.folders, folderName => ({
            value: folderName,
            label: folderName,
        }));

        return (
            <div>
                <section id="control-background">
                    <section id="control">
                        {capitalizeFirstLetter(this.props.action)}
                        <strong>{this.props.subject}</strong>...
                        <Select
                            id="control-input"
                            classNamePrefix="react-select"
                            options={folderOptions}
                            autoFocus={true}
                            openMenuOnFocus={true}
                            closeMenuOnSelect={false}
                            onMenuClose={this.handleClose}
                            onChange={this.handleSelectChange}
                            onFocus={keyboard.disable}
                            onBlur={keyboard.enable}
                        />
                    </section>
                </section>
            </div>
        );
    }
}


@subscribe(controlStore)
export default class ControlInputWrapper extends React.Component {
    static propTypes = {
        open: PropTypes.bool.isRequired,
        action: PropTypes.string,
        subject: PropTypes.string,
        moveData: PropTypes.object,
    }

    render() {
        if (!this.props.open) {
            return null;
        }

        return <ControlInput {...this.props} />;
    }
}
