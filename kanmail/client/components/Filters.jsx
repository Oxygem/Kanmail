import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import { ALIAS_FOLDERS, ALIAS_TO_ICON } from 'constants.js';

import mainEmailStore from 'emails/main.js';

import filterStore from 'stores/filters.js';
import settingsStore from 'stores/settings.js';
import { subscribe } from 'stores/base.jsx';

import { get } from 'util/requests.js';
import { capitalizeFirstLetter } from 'util/string.js';


@subscribe(filterStore, settingsStore)
export default class Filters extends React.Component {
    static propTypes = {
        mainColumn: PropTypes.string.isRequired,
        filterStore: PropTypes.object.isRequired,
        accounts: PropTypes.object.isRequired,
        accountName: PropTypes.string,
    }

    setAccountFilter = (accountName) => {
        this.props.filterStore.setAccountFilter(accountName);
    }

    renderAliases() {
        return _.map(ALIAS_FOLDERS, alias => {
            const iconName = ALIAS_TO_ICON[alias];
            const isActive = this.props.mainColumn === alias;
            const handleClick = () => {
                // Always sync when changing folders or re-clicking the active one
                mainEmailStore.syncFolderEmails(alias);

                if (this.props.mainColumn !== alias) {
                    filterStore.setMainColumn(alias);
                }
            }

            return (
                <li key={alias} className={isActive ? 'active': ''}>
                    <a onClick={handleClick}>
                        <i className={`fa fa-${iconName}`}></i>
                        {capitalizeFirstLetter(alias)}
                    </a>
                </li>
            );
        });
    }

    renderAccounts() {
        return _.map(_.keys(this.props.accounts), key => (
            <li key={key} className={this.props.accountName === key ? 'active': ''}><a
                onClick={_.partial(this.setAccountFilter, key)}>
                <i className="fa fa-google"></i> {_.capitalize(key)}
            </a></li>
        ));
    }

    render() {
        return (<div>
            <ul>{this.renderAliases()}</ul>

            <ul>
                <li className={_.isNull(this.props.accountName) ? 'active': ''}><a
                    onClick={_.partial(this.setAccountFilter, null)}>
                    <i className="fa fa-globe"></i> All accounts
                </a></li>
                {this.renderAccounts()}
            </ul>

            <ul>
                <li>
                    <a onClick={() => get('/open-settings')}>
                        <i className="fa fa-cog"></i> Settings
                    </a>
                </li>
            </ul>
        </div>);
    }
}
