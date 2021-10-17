import React from 'react';
import PropTypes from 'prop-types';

import Editor from 'components/Editor.jsx';


const getInitialState = (props) => {
    const state = {
        editingTab: props.isAddingNewSignature ? 'imap' : 'address',
        deleteConfirm: false,

        error: props.error,
        errorType: props.errorType,

        isSaving: false,

        accountId: props.accountId,

        name: '',
        signatureText: '',
        signatureHtml: '',
    };

    if (props.itemData) {
        state.name = props.itemData.name;
        state.signatureText = props.itemData.text;
        state.signatureHtml = props.itemData.html;
    }

    return state;
};


export default class SignatureForm extends React.Component {
    static propTypes = {
        itemData: PropTypes.object.isRequired,
        itemIndex: PropTypes.number,
        updateItem: PropTypes.func,
        isAddingNewSignature: PropTypes.bool,
        closeForm: PropTypes.func,
    }

    constructor(props) {
        super(props);
        this.state = getInitialState(props);
    }

    resetState = () => {
        const state = getInitialState(this.props);
        this.setState(state);
    }

    handleClickCancel = (ev) => {
        ev.preventDefault();


        this.resetState();
    }

    handleUpdate = (settingsKey, key, ev) => {
        let value = ev.target.value;
        if (value && ev.target.type === 'number') {
            value = parseInt(value);
        }

        const target = this.state[settingsKey];
        target[key] = value;

        this.setState({
            [settingsKey]: target,
        });
    }

    handleCheckboxUpdate = (settingsKey, key, ev) => {
        const target = this.state[settingsKey];
        target[key] = ev.target.checked;

        this.setState({
            [settingsKey]: target,
        });
    }

    render() {
        const formClasses = ['account'];
        if (this.state.editing) formClasses.push('active');
        if (this.props.isAddingNewSignature) formClasses.push('new');

        const saveButtonClasses = ['submit'];
        if (this.state.isSaving) {
            saveButtonClasses.push('disabled');
        }

        return (
            <form className={formClasses.join(' ')}>
                <div className="wide top-bar">
                    <div className="right">
                        <button
                            type="submit"
                            className={saveButtonClasses.join(' ')}
                            onClick={this.handleTestConnection}
                        >{this.props.isAddingNewSignature ? 'Add account' : 'Update'}</button>
                        &nbsp;
                        <button
                            type="submit"
                            onClick={this.props.closeForm}
                        >Cancel</button>
                    </div>
                    <input
                        className="inline"
                        type="text"
                        value={this.state.name}
                        placeholder="Signature name"
                        onChange={(ev) => this.setState({name: ev.target.value})}
                    />
                    &nbsp;

                    <div className="error">{this.state.error}</div>
                </div>

                <div>
                    <Editor />
                </div>
            </form>
        );
    }
}
