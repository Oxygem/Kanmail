import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import { ALIAS_FOLDERS, ALIAS_TO_ICON } from 'constants.js';
import { openSettings } from 'window.js';
import filterStore from 'stores/filters.js';
import settingsStore from 'stores/settings.js';
import updateStore from 'stores/update.js';
import { subscribe } from 'stores/base.jsx';
import { getColumnMetaStore } from 'stores/columns.js';
import mainEmailStore from 'stores/emails/main.js';
import { capitalizeFirstLetter } from 'util/string.js';


@subscribe(filterStore, settingsStore, updateStore)
export default class Filters extends React.Component {
    static propTypes = {
        mainColumn: PropTypes.string.isRequired,
        filterStore: PropTypes.object.isRequired,
        accounts: PropTypes.object.isRequired,
        updateReady: PropTypes.bool.isRequired,
        updateDownloading: PropTypes.bool.isRequired,
        styleSettings: PropTypes.object.isRequired,
        accountName: PropTypes.string,
        updateVersion: PropTypes.string,
    }

    setAccountFilter = (accountName) => {
        this.props.filterStore.setAccountFilter(accountName);
    }

    renderMainColumnFolders() {
        const mainFolders = [...ALIAS_FOLDERS];

        let sidebarFolders = this.props.styleSettings.sidebar_folders;
        if (sidebarFolders) {
            sidebarFolders = sidebarFolders.split(',');
            mainFolders.push(...sidebarFolders);
        }

        return _.map(mainFolders, alias => {
            const iconName = ALIAS_TO_ICON[alias] || 'folder';
            const isActive = this.props.mainColumn === alias;
            const handleClick = () => {
                const columnMetaStore = getColumnMetaStore(alias);

                // Sync when changing folders or re-clicking the active one
                if (!columnMetaStore.props.isSyncing) {
                    mainEmailStore.syncFolderEmails(alias);
                }

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
                <i className="fa fa-google"></i> {key}
            </a></li>
        ));
    }

    renderUpdateLink() {
        if (!this.props.updateVersion) {
            return;
        }

        if (this.props.updateReady) {
            return (
                <li>
                    <a>
                        Update installed, restart Kanmail when ready...
                    </a>
                </li>
            );
        }

        const classNames = ['fa', 'fa-refresh'];
        if (this.props.updateDownloading) {
            classNames.push('fa-spin');
        }

        return (
            <li>
                <a onClick={() => updateStore.doUpdate()}>
                    <i className={classNames.join(' ')}></i> Update
                    <span>new: {this.props.updateVersion}</span>
                </a>
            </li>
        );
    }

    render() {
        return (<div>
            <ul>{this.renderMainColumnFolders()}</ul>

            <ul>
                <li className={_.isNull(this.props.accountName) ? 'active': ''}><a
                    onClick={_.partial(this.setAccountFilter, null)}>
                    <i className="fa fa-globe"></i> All accounts
                </a></li>
                {this.renderAccounts()}
            </ul>

            <ul>
                <li>
                    <a onClick={openSettings}>
                        <i className="fa fa-cog"></i> Settings
                    </a>
                </li>
            </ul>

            <ul>
                {this.renderUpdateLink()}
            </ul>
        </div>);
    }
}
