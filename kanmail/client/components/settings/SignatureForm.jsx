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
    };

    if (props.itemData) {
        state.name = props.itemData.name;
    }

    return state;
};


export default class SignatureForm extends React.Component {
    static propTypes = {
        itemData: PropTypes.object,
        itemIndex: PropTypes.number,
        updateItem: PropTypes.func,
        addItem: PropTypes.func,
        closeForm: PropTypes.func,
    }

    constructor(props) {
        super(props);
        this.state = getInitialState(props);
    }

    handleSubmit = (ev) => {
        ev.preventDefault();

        if (!this.state.name) {
            this.setState({error: 'Please input a name for this signature.'});
            return;
        }

        const newItemData = {
            name: this.state.name,
            text: this.editor.getText(),
            html: this.editor.getHtml(),
        };

        if (this.props.itemData) {
            this.props.updateItem(this.props.itemIndex, newItemData);
        } else {
            this.props.addItem(newItemData);
        }

        this.props.closeForm();
    }

    render() {
        const formClasses = ['account'];
        if (this.state.editing) formClasses.push('active');

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
                            onClick={this.handleSubmit}
                        >{this.props.itemData ? 'Update' : 'Add Signature'}</button>
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

                <div className="wide">
                    <Editor
                        initialHtml={this.props.itemData && this.props.itemData.html}
                        ref={editor => this.editor = editor}
                    />
                </div>
            </form>
        );
    }
}
