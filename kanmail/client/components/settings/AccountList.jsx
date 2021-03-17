import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import AccountForm from 'components/settings/AccountForm.jsx';
import NewAccountForm from 'components/settings/NewAccountForm.jsx';


class AccountListItem extends React.Component {
    static propTypes = {
        accountSettings: PropTypes.object.isRequired,
        deleteAccount: PropTypes.func.isRequired,
        editAccount: PropTypes.func.isRequired,
        accountIndex: PropTypes.number.isRequired,
        moveUp: PropTypes.func.isRequired,
        moveDown: PropTypes.func.isRequired,
        connected: PropTypes.bool.isRequired,
    }

    constructor(props) {
        super(props);
        this.state = {
            deleteConfirm: false,
        }
    }

    handleClickCancel = (ev) => {
        ev.preventDefault();

        this.setState({
            deleteConfirm: false,
        });
    }

    handleClickEdit = (ev) => {
        ev.preventDefault();
        this.props.editAccount(this.props.accountIndex);
    }

    handleClickDelete = (ev) => {
        ev.preventDefault();

        if (!this.state.deleteConfirm) {
            this.setState({
                deleteConfirm: true,
            });
            return;
        }

        this.props.deleteAccount(this.props.accountIndex);
        return;
    }

    renderViewButtons() {
        if (this.state.deleteConfirm) {
            return (
                <div className="right">
                    <button onClick={this.handleClickCancel}>Cancel</button>
                    &nbsp;
                    <button
                        className="cancel"
                        onClick={this.handleClickDelete}
                    >Are you SURE?</button>
                </div>
            );
        }

        return (
            <div className="right">
                <button onClick={this.props.moveUp} className="inactive">
                    <i className="fa fa-arrow-up"></i>
                </button>
                &nbsp;
                <button onClick={this.props.moveDown} className="inactive">
                    <i className="fa fa-arrow-down"></i>
                </button>
                &nbsp;
                <button onClick={this.handleClickEdit}>
                    Edit
                </button>
                &nbsp;
                <button onClick={this.handleClickDelete} className="cancel">
                    {this.state.deleteConfirm ? 'Are you SURE?' : 'Delete'}
                </button>
            </div>
        );
    }

    renderConnectedText() {
        if (this.props.connected) {
            return <small className="connected">connected</small>;
        } else {
            return <small className="not-connected">no connection</small>;
        }
    }

    render() {
        return (
            <div className="account">
                <div className="wide">
                    {this.renderViewButtons()}
                    <strong>{this.props.accountSettings.name}</strong>
                    &nbsp;
                    {this.renderConnectedText()}
                    <br />
                    {this.props.accountSettings.imap_connection.username}
                </div>
            </div>
        );
    }
}


export default class AccountList extends React.Component {
    static propTypes = {
        accounts: PropTypes.array.isRequired,
        addAccount: PropTypes.func.isRequired,
        deleteAccount: PropTypes.func.isRequired,
        updateAccount: PropTypes.func.isRequired,
        moveAccount: PropTypes.func.isRequired,
        newAccountFormProps: PropTypes.object,
    }

    constructor(props) {
        super(props);

        this.state = {
            addingAccount: false,
            editingAccountIndex: null,
        };
    }

    handleClickAddAccount = () => {
        this.setState({
            addingAccount: true,
            editingAccountIndex: null,
        });
    }

    handleClickCancelAddAccount = () => {
        this.setState({
            addingAccount: false,
            editingAccountIndex: null,
        });
    }

    handleClickEditAccount = (accountIndex) => {
        this.setState({
            addingAccount: false,
            editingAccountIndex: accountIndex,
        });
    }

    handleClickCancelEditAccount = () => {
        this.setState({
            addingAccount: false,
            editingAccountIndex: null,
        });
    }

    renderAccounts() {
        return _.map(this.props.accounts, (accountSettings, i) => (
            <AccountListItem
                key={`${i}-${accountSettings.name}`}
                accountIndex={i}
                connected={true}
                accountSettings={accountSettings}
                deleteAccount={this.props.deleteAccount}
                editAccount={this.handleClickEditAccount}
                moveUp={_.partial(this.props.moveAccount, i, -1)}
                moveDown={_.partial(this.props.moveAccount, i, 1)}
            />
        ));
    }

    renderAccountForm() {
        if (this.state.addingAccount) {
            return (
                <div id="account-form-overlay">
                    <NewAccountForm
                        closeForm={this.handleClickCancelAddAccount}
                        addAccount={this.props.addAccount}
                        {...this.props.newAccountFormProps}
                    />
                </div>
            );
        }

        if (!_.isNull(this.state.editingAccountIndex)) {
            return (
                <div id="account-form-overlay">
                    <AccountForm
                        connected={true}
                        accountSettings={this.props.accounts[this.state.editingAccountIndex]}
                        updateAccount={this.props.updateAccount}
                        closeForm={this.handleClickCancelEditAccount}
                    />
                </div>
            );
        }

        return null;
    }

    render() {
        return (
            <div id="accounts">
                {this.renderAccounts()}
                <button className="submit" onClick={this.handleClickAddAccount}>
                    Add new account
                </button>
                {this.renderAccountForm()}
            </div>
        );
    }
}
