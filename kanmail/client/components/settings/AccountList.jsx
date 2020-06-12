import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import Account from 'components/settings/Account.jsx';
import NewAccountForm from 'components/settings/NewAccountForm.jsx';


export default class AccountList extends React.Component {
    static propTypes = {
        accounts: PropTypes.array.isRequired,
        addAccount: PropTypes.func.isRequired,
        deleteAccount: PropTypes.func.isRequired,
        updateAccount: PropTypes.func.isRequired,
        moveAccount: PropTypes.func.isRequired,
        newAccountFormProps: PropTypes.object,
    }

    renderAccounts() {
        return _.map(this.props.accounts, (accountSettings, i) => (
            <Account
                key={`${i}-${accountSettings.name}`}
                accountIndex={i}
                connected={true}
                accountSettings={accountSettings}
                deleteAccount={this.props.deleteAccount}
                updateAccount={this.props.updateAccount}
                moveUp={_.partial(this.props.moveAccount, i, -1)}
                moveDown={_.partial(this.props.moveAccount, i, 1)}
            />
        ));
    }

    render() {
        return (
            <div id="accounts">
                {this.renderAccounts()}
                <div id="add-account">
                    <NewAccountForm
                        addAccount={this.props.addAccount}
                        {...this.props.newAccountFormProps}
                    />
                </div>
            </div>
        );
    }
}
