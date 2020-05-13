import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';
import { DropTarget } from 'react-dnd';

import { ALIAS_FOLDERS, ALIAS_TO_ICON } from 'constants.js';
import { openSettings, openContacts, openLicense } from 'window.js';

import filterStore from 'stores/filters.js';
import settingsStore from 'stores/settings.js';
import updateStore from 'stores/update.js';
import folderStore from 'stores/folders.js';
import { getEmailStore } from 'stores/emailStoreProxy.js';
import { subscribe } from 'stores/base.jsx';
import { getColumnMetaStore } from 'stores/columns.js';
import mainEmailStore from 'stores/emails/main.js';

import { capitalizeFirstLetter } from 'util/string.js';
import { getAccountIconName } from 'util/accounts.js';


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
        ).then(() => {
            emailStore.syncFolderEmails(
                oldColumn,
                {accountName: accountName},
            );
            emailStore.syncFolderEmails(
                props.id,
                {
                    accountName: accountName,
                    // Tell the backend to expect X messages (and infer if needed!)
                    query: {uid_count: messageUids.length},
                },
            );
        });
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

        pinned: PropTypes.bool,
    }

    componentDidUpdate(prevProps) {
        if (this.props.canDrop && !prevProps.isOver && this.props.isOver) {
            this.containerLi.classList.add('hover');
        } else {
            this.containerLi.classList.remove('hover');
        }
    }

    pinFolder = (ev) => {
        ev.stopPropagation();
        settingsStore.addSidebarFolder(this.props.folderName);
    }

    unpinFolder = (ev) => {
        ev.stopPropagation();
        settingsStore.removeSidebarFolder(this.props.folderName);
    }

    renderPinButton() {
        if (this.props.pinned === true) {
            return <i className="pin-button fa fa-bookmark" onClick={this.unpinFolder} />
        }

        if (this.props.pinned === false) {
            return <i className="pin-button fa fa-bookmark-o" onClick={this.pinFolder} />
        }

        return null;
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
                    {this.renderPinButton()}
                </a>
            </li>
        );
    }
}


@subscribe(filterStore, settingsStore, updateStore, folderStore)
export default class Filters extends React.Component {
    static propTypes = {
        mainColumn: PropTypes.string.isRequired,
        filterStore: PropTypes.object.isRequired,
        accounts: PropTypes.array.isRequired,
        updateReady: PropTypes.bool.isRequired,
        updateDownloading: PropTypes.bool.isRequired,
        styleSettings: PropTypes.object.isRequired,
        folders: PropTypes.array.isRequired,
        accountName: PropTypes.string,
        updateVersion: PropTypes.string,
    }

    constructor(props) {
        super(props);

        this.state = {
            showAllFolders: false,
        };
    }

    setAccountFilter = (accountName) => {
        this.props.filterStore.setAccountFilter(accountName);
    }

    toggleShowAllFolders = () => {
        this.setState({showAllFolders: !this.state.showAllFolders});
    }

    renderFolderLinks(folders, extraProps) {
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
                {...extraProps}
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

        return this.renderFolderLinks(sidebarFolders);
    }

    renderShowAllFolders() {
        if (!this.props.folders || !this.props.folders.length) {
            return;
        }

        if (this.state.showAllFolders) {
            return <li key="show-all" className="small"><a onClick={this.toggleShowAllFolders}>
                <i className="fa fa-arrow-up" />Hide {this.props.folders.length} folders
            </a></li>;
        }

        return <li key="show-all" className="small"><a onClick={this.toggleShowAllFolders}>
                <i className="fa fa-arrow-down" />Show {this.props.folders.length} folders
        </a></li>;
    }

    renderOtherFolderLinks() {
        let sidebarFolderNames = this.props.styleSettings.sidebar_folders || [];
        const sidebarFolders = this.renderFolderLinks(
            sidebarFolderNames,
            {pinned: this.state.showAllFolders ? true : null},
        );

        sidebarFolders.push(this.renderShowAllFolders());

        if (this.state.showAllFolders) {
            sidebarFolderNames = new Set(sidebarFolderNames);
            const otherFolderNames = _.filter(
                this.props.folders,
                name => !sidebarFolderNames.has(name),
            );
            sidebarFolders.push(...this.renderFolderLinks(otherFolderNames, {pinned: false}));
        }

        return sidebarFolders;
    }

    renderAccounts() {
        return _.map(this.props.accounts, account => (
            <li
                key={account.name}
                className={this.props.accountName === account.name ? 'active': ''}
            ><a onClick={_.partial(this.setAccountFilter, account.name)}>
                <i className={`fa fa-${getAccountIconName(account)}`}></i> {account.name}
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
        return (<div id="filters">
            <ul>{this.renderMainFolderLinks()}</ul>
            <ul>{this.renderOtherFolderLinks()}</ul>

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

                {!window.KANMAIL_LICENSED && <li>
                    <a onClick={openLicense}>
                        <i className="fa fa-shopping-cart"></i> License
                    </a>
                </li>}
            </ul>

            <ul>
                {this.renderUpdateLink()}
            </ul>
        </div>);
    }
}
