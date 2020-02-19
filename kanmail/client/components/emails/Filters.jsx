import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';
import { DropTarget } from 'react-dnd';

import { ALIAS_FOLDERS, ALIAS_TO_ICON } from 'constants.js';
import { openSettings, openContacts } from 'window.js';
import filterStore from 'stores/filters.js';
import settingsStore from 'stores/settings.js';
import updateStore from 'stores/update.js';
import { getEmailStore } from 'stores/emailStoreProxy.js';
import { subscribe } from 'stores/base.jsx';
import { getColumnMetaStore } from 'stores/columns.js';
import mainEmailStore from 'stores/emails/main.js';
import { capitalizeFirstLetter } from 'util/string.js';


const folderLinkTarget = {
    canDrop(props, monitor) {
        const { oldColumn } = monitor.getItem();
        return oldColumn !== props.folderName;
    },

    drop(props, monitor) {
        const { messageUids, oldColumn, accountName } = monitor.getItem();

        const emailStore = getEmailStore();

        emailStore.moveEmails(
            accountName,
            messageUids,
            oldColumn,
            props.folderName,

        // Load any new emails for the new column (including the ones we
        // just copied over, as they always appear sequentially). This also
        // triggers the processEmailChanges function. We force this because
        // we might have moved stuff into a folder where it already existed.
        ).then(() => emailStore.syncFolderEmails(
            props.id,
            {
                forceProcess: true,
                accountName: accountName,
                // Tell the backend to expect X messages (and infer if needed!)
                query: {uid_count: messageUids.length},
            },
        ));
    },
};


function collect(connect, monitor) {
    return {
        connectDropTarget: connect.dropTarget(),
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
    };
}


@DropTarget('email', folderLinkTarget, collect)
class SidebarFolderLink extends React.Component {
    static propTypes = {
        folderName: PropTypes.string.isRequired,
        iconName: PropTypes.string.isRequired,
        isActive: PropTypes.bool.isRequired,
        handleClick: PropTypes.func.isRequired,

        isOver: PropTypes.bool.isRequired,
        canDrop: PropTypes.bool.isRequired,
        connectDropTarget: PropTypes.func.isRequired,
    }

    componentDidUpdate(prevProps) {
        if (this.props.canDrop && !prevProps.isOver && this.props.isOver) {
            this.containerLi.classList.add('hover');
        } else {
            this.containerLi.classList.remove('hover');
        }
    }

    render() {
        const { connectDropTarget } = this.props;

        return connectDropTarget(
            <li
                key={this.props.folderName}
                className={this.props.isActive ? 'active': ''}
                ref={(li) => {this.containerLi = li;}}
            >
                <a onClick={this.props.handleClick}>
                    <i className={`fa fa-${this.props.iconName}`}></i>
                    {capitalizeFirstLetter(this.props.folderName)}
                </a>
            </li>
        );
    }
}


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

    renderFolderLinks(folders) {
        return _.map(folders, folderName => {
            const iconName = ALIAS_TO_ICON[folderName] || 'folder';
            const isActive = this.props.mainColumn === folderName;
            const handleClick = () => {
                const columnMetaStore = getColumnMetaStore(folderName);

                // Sync when changing folders or re-clicking the active one
                if (!columnMetaStore.props.isSyncing) {
                    mainEmailStore.syncFolderEmails(folderName);
                }

                if (this.props.mainColumn !== folderName) {
                    filterStore.setMainColumn(folderName);
                }
            }

            return <SidebarFolderLink
                key={folderName}
                folderName={folderName}
                isActive={isActive}
                handleClick={handleClick}
                iconName={iconName}
            />;
        });
    }

    renderMainFolderLinks() {
        return this.renderFolderLinks(ALIAS_FOLDERS);
    }

    renderCustomFolderLinks() {
        let sidebarFolders = this.props.styleSettings.sidebar_folders;
        if (!sidebarFolders) {
            return null;
        }

        if (_.isString(sidebarFolders)) {
            sidebarFolders = sidebarFolders.split(',');
        }

        return this.renderFolderLinks(sidebarFolders);
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
                <li><span>
                    Update installed, restart Kanmail when ready...
                </span></li>
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
            <ul>{this.renderMainFolderLinks()}</ul>
            <ul>{this.renderCustomFolderLinks()}</ul>

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
                <li>
                    <a onClick={openContacts}>
                        <i className="fa fa-address-book"></i> Contacts
                    </a>
                </li>
            </ul>

            <ul>
                {this.renderUpdateLink()}
            </ul>
        </div>);
    }
}
