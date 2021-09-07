import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';
import { DropTarget } from 'react-dnd';

import { ALIAS_FOLDERS, ALIAS_TO_ICON } from 'constants.js';
import { openSettings, openContacts, openLicense, openLink } from 'window.js';

import filterStore from 'stores/filters.js';
import settingsStore from 'stores/settings.js';
import updateStore from 'stores/update.js';
import folderStore from 'stores/folders.js';
import { subscribe } from 'stores/base.jsx';
import { getColumnMetaStore } from 'stores/columns.js';
import mainEmailStore from 'stores/emails/main.js';

import { getAccountIconName } from 'util/accounts.js';
import { capitalizeFirstLetter } from 'util/string.js';
import { moveOrCopyThread } from 'util/threads.js';

const ALIAS_TO_CLASS = {
    'inbox': 'pink',
    'sent': 'blue',
    'drafts': 'white',
    'archive': 'green',
    'trash': 'red',
    'spam': 'yellow',
};


const folderLinkTarget = {
    canDrop(props, monitor) {
        const { oldColumn } = monitor.getItem();
        return oldColumn !== props.folderName;
    },

    drop(props, monitor) {
        const moveData = monitor.getItem();
        moveOrCopyThread(moveData, props.folderName);
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
        iconClassName: PropTypes.string.isRequired,
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
                    <i className={`fa fa-${this.props.iconName} ${this.props.iconClassName}`}></i>
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
        updateError: PropTypes.string,
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
            const iconClassName = ALIAS_TO_CLASS[folderName] || 'white';
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
                iconClassName={iconClassName}
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

        const sidebarFoldersLength = this.props.styleSettings.sidebar_folders.length || 0;
        const nFolders = this.props.folders.length - sidebarFoldersLength;

        if (this.state.showAllFolders) {
            return <li key="show-all" className="small"><a onClick={this.toggleShowAllFolders}>
                <i className="fa fa-arrow-up" />Hide {nFolders} folders
            </a></li>;
        }

        return <li key="show-all" className="small"><a onClick={this.toggleShowAllFolders}>
                <i className="fa fa-arrow-down" />Show {nFolders} folders
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
                <i className={`fa fa-${getAccountIconName(account)} white`}></i> {account.name}
            </a></li>
        ));
    }

    renderUpdateLink() {
        if (this.props.updateError) {
            return (
                <li><a onClick={() => openLink('https://kanmail.io/download')}>
                    <span className="update error">
                        Error downloading update: <code>{this.props.updateError}</code>.<br />Please re-download the latest version from the Kanmail website.
                    </span>
                </a></li>
            );
        }

        if (!this.props.updateVersion) {
            return;
        }

        if (this.props.updateReady) {
            return (
                <li><span className="update">
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
            {!window.KANMAIL_LICENSED && <ul><li>
                <a onClick={openLicense}>
                    <i className="fa fa-shopping-cart green"></i> Purchase Kanmail
                </a>
            </li></ul>}

            <ul>
                {this.renderMainFolderLinks()}
                {this.renderOtherFolderLinks()}
            </ul>

            <ul>
                <li className={_.isNull(this.props.accountName) ? 'active': ''}><a
                    onClick={_.partial(this.setAccountFilter, null)}>
                    <i className="fa fa-globe white"></i> All accounts
                </a></li>
                {this.renderAccounts()}
            </ul>

            <ul>
                <li>
                    <a onClick={openContacts}>
                        <i className="fa fa-address-book"></i> Contacts
                    </a>
                </li>
                <li>
                    <a onClick={openSettings}>
                        <i className="fa fa-cog"></i> Settings
                    </a>
                </li>

                {settingsStore.props.systemSettings.show_help_button && <li>
                    <a onClick={() => openLink('https://kanmail.io/docs')}>
                        <i className="fa fa-support"></i> Help
                    </a>
                </li>}
            </ul>

            <ul>
                {this.renderUpdateLink()}
            </ul>
        </div>);
    }
}
