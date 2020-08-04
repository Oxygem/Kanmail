import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';
import Select from 'react-select';

import keyboard from 'keyboard.js';

import controlStore from 'stores/control.js';
import folderStore from 'stores/folders.js';
import { subscribe } from 'stores/base.jsx';

import { capitalizeFirstLetter } from 'util/string.js';
import { moveOrCopyThread } from 'util/threads.js';


@subscribe(folderStore)
class ControlInput extends React.Component {
    static propTypes = {
        folders: PropTypes.array.isRequired,
        action: PropTypes.string,
        subject: PropTypes.string,
        moveData: PropTypes.object,
    }

    handleSelectChange = (value) => {
        moveOrCopyThread(
            this.props.moveData,
            value.value,
            this.props.action === 'copy',  // copy bool
        );
        // Flag the thread component as moving (hide it)
        this.handleClose();
        keyboard.setMovingCurrentThread();
    }

    handleClose = () => {
        controlStore.close();
        setTimeout(keyboard.enable, 0);  // prevent the *current* keyboard event executing
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
