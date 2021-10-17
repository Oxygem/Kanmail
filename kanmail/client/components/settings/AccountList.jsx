import React from 'react';
import PropTypes from 'prop-types';

import AccountForm from 'components/settings/AccountForm.jsx';
import NewAccountForm from 'components/settings/NewAccountForm.jsx';
import OverlayItemList from 'components/settings/OverlayItemList.jsx';


class AccountListItem extends React.Component {
    static propTypes = {
        itemData: PropTypes.object.isRequired,
        deleteItem: PropTypes.func.isRequired,
        editItem: PropTypes.func.isRequired,
        itemIndex: PropTypes.number.isRequired,
        moveUp: PropTypes.func.isRequired,
        moveDown: PropTypes.func.isRequired,
        accountNameToConnected: PropTypes.object.isRequired,
    }

    constructor(props) {
        super(props);
        this.state = {
            deleteConfirm: false,
        }
    }

    isConnected = () => {
        return (
            this.props.accountNameToConnected
            && this.props.accountNameToConnected[this.props.itemData.name]
        );
    }

    handleClickCancel = (ev) => {
        ev.preventDefault();

        this.setState({
            deleteConfirm: false,
        });
    }

    handleClickEdit = (ev) => {
        ev.preventDefault();
        this.props.editItem(this.props.itemIndex);
    }

    handleClickDelete = (ev) => {
        ev.preventDefault();

        if (!this.state.deleteConfirm) {
            this.setState({
                deleteConfirm: true,
            });
            return;
        }

        this.props.deleteItem(this.props.itemIndex);
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
        if (this.isConnected()) {
            return <small className="connected">connected</small>;
        } else {
            return <small className="not-connected">not connected</small>;
        }
    }

    render() {
        return (
            <div className="account">
                <div className="wide">
                    {this.renderViewButtons()}
                    <strong>{this.props.itemData.name}</strong>
                    &nbsp;
                    {this.renderConnectedText()}
                    <br />
                    {this.props.itemData.imap_connection.username}
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
        accountNameToConnected: PropTypes.object.isRequired,
        newAccountFormProps: PropTypes.object,
    }

    render() {
        return <OverlayItemList
            items={this.props.accounts}
            addItem={this.props.addAccount}
            deleteItem={this.props.deleteAccount}
            updateItem={this.props.updateAccount}
            moveItem={this.props.moveAccount}
            itemComponent={AccountListItem}
            itemFormComponent={AccountForm}
            newItemFormComponent={NewAccountForm}
            newItemName="account"
            extraItemProps={{
                accountNameToConnected: this.props.accountNameToConnected,
            }}
        />
    }
}
