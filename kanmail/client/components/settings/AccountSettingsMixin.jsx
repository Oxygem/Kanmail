import _ from 'lodash';
import React from 'react';

import { arrayMove } from 'util/array.js';


export default class AccountSettingsMixin extends React.Component {
    deleteAccount = (accountIndex) => {
        const accounts = _.filter(this.state.accounts, (_, i) => i !== accountIndex);
        this.setState({accounts});
    }

    updateAccount = (accountIndex, newSettings) => {
        if (!this.state.accounts[accountIndex]) {
            throw Error('nope');
        }

        const accounts = this.state.accounts;
        accounts[accountIndex] = newSettings;
        this.setState({accounts});
    }

    addAccount = (name, newSettings) => {
        newSettings.name = name;

        const accounts = this.state.accounts;
        accounts.push(newSettings);

        const accountNameToConnected = this.state.accountNameToConnected;
        accountNameToConnected[name] = true;

        this.setState({accounts, accountNameToConnected});
    }

    moveAccount = (index, position) => {
        const accounts = this.state.accounts;
        arrayMove(accounts, index, index + position);
        this.setState({accounts});
    }
}
