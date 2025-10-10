import _ from "lodash";
import React from "react";
import { DropTarget } from "react-dnd";

import { AppService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { ALIAS_FOLDERS, ALIAS_TO_ICON } from "../../constants.ts";
import { subscribe } from "../../stores/base.tsx";
import filterStore from "../../stores/filters.ts";
import settingsStore, { ISettings } from "../../stores/settings.ts";
import systemStore from "../../stores/system.ts";
import { getAccountIconName } from "../../util/accounts.js";
import { trackEvent } from "../../util/analytics.ts";
import { capitalizeFirstLetter } from "../../util/string.js";
import { moveOrCopyThread } from "../../util/threads.js";

const ALIAS_TO_CLASS = {
  inbox: "pink",
  sent: "blue",
  drafts: "white",
  archive: "green",
  trash: "red",
  junk: "yellow",
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

interface ISidebarFolderLinkProps {
  canDrop: boolean;
  isOver: boolean;
  isActive: boolean;
  folderName: string;
  pinned: boolean;
  unreadCount: number;
  connectDropTarget: any;
  iconName: string;
  iconClassName: string;
  handleClick: () => {};
}

@DropTarget("email", folderLinkTarget, collect)
class SidebarFolderLink extends React.Component<ISidebarFolderLinkProps> {
  containerLi: HTMLLIElement | null;

  componentDidUpdate(prevProps) {
    if (this.props.canDrop && !prevProps.isOver && this.props.isOver) {
      this.containerLi!.classList.add("hover");
    } else {
      this.containerLi!.classList.remove("hover");
    }
  }

  pinFolder = (ev) => {
    ev.stopPropagation();
    settingsStore.addSidebarFolder(this.props.folderName);
  };

  unpinFolder = (ev) => {
    ev.stopPropagation();
    settingsStore.removeSidebarFolder(this.props.folderName);
  };

  renderPinButton() {
    if (this.props.pinned === true) {
      return (
        <i className="pin-button fa fa-bookmark" onClick={this.unpinFolder} />
      );
    }

    if (this.props.pinned === false) {
      return (
        <i className="pin-button fa fa-bookmark-o" onClick={this.pinFolder} />
      );
    }

    return null;
  }

  renderUnreadCount() {
    if (this.props.unreadCount) {
      return <span className="unread-count">{this.props.unreadCount}</span>;
    }

    return null;
  }

  render() {
    const { connectDropTarget } = this.props;

    return connectDropTarget(
      <li
        key={this.props.folderName}
        className={this.props.isActive ? "active" : ""}
        ref={(li) => {
          this.containerLi = li;
        }}
      >
        <a onClick={this.props.handleClick}>
          <i
            className={`fa fa-${this.props.iconName} ${this.props.iconClassName}`}
          ></i>
          {capitalizeFirstLetter(this.props.folderName)}
          {this.renderPinButton()}
          {this.renderUnreadCount()}
        </a>
      </li>
    );
  }
}

interface IFiltersProps extends ISettings {
  mainColumn: string;
  accountName: string | null;
  folderNames: string[];
}

interface IFiltersState {
  showAllFolders: boolean;
  isUpdating: boolean;
  updateNeedsRestart: boolean;
}

@subscribe(filterStore, settingsStore)
export default class Filters extends React.Component<IFiltersProps, IFiltersState> {
  constructor(props) {
    super(props);

    this.state = {
      showAllFolders: false,
      isUpdating: false,
      updateNeedsRestart: false,
    };
  }

  setAccountFilter = (accountName) => {
    settingsStore.setCurrentAccount(accountName);
  };

  toggleShowAllFolders = () => {
    this.setState({ showAllFolders: !this.state.showAllFolders });
  };

  renderFolderLinks(folders, extraProps: any = undefined) {
    return _.map(folders, (folderName) => {
      const iconName = ALIAS_TO_ICON[folderName] || "folder";
      const iconClassName = ALIAS_TO_CLASS[folderName] || "white";
      const isActive = settingsStore.getCurrentColumns()[0] === folderName;
      const handleClick = () => {
        if (!isActive) {
          settingsStore.setColumn(folderName, 0)
        }
      };

      return (
        <SidebarFolderLink
          key={folderName}
          folderName={folderName}
          isActive={isActive}
          handleClick={handleClick}
          iconName={iconName}
          iconClassName={iconClassName}
          {...extraProps}
        />
      );
    });
  }

  renderMainFolderLinks() {
    return this.renderFolderLinks(ALIAS_FOLDERS);
  }

  renderCustomFolderLinks() {
    let sidebarFolders = this.props.sidebarFolders;
    if (!sidebarFolders) {
      return null;
    }

    return this.renderFolderLinks(sidebarFolders);
  }

  renderShowAllFolders() {

    if (!this.props.folderNames || !this.props.folderNames.length) {
      return;
    }

    const sidebarFoldersLength =
      (this.props.sidebarFolders || []).length || 0;
    const nFolders = this.props.folderNames.length - sidebarFoldersLength;

    if (this.state.showAllFolders) {
      return (
        <li key="show-all" className="small">
          <a onClick={this.toggleShowAllFolders}>
            <i className="fa fa-arrow-up" />
            Hide {nFolders} folders
          </a>
        </li>
      );
    }

    return (
      <li key="show-all" className="small">
        <a onClick={this.toggleShowAllFolders}>
          <i className="fa fa-arrow-down" />
          Show {nFolders} folders
        </a>
      </li>
    );
  }

  renderOtherFolderLinks() {
    const folderNames = this.props.sidebarFolders || []

    const sidebarFolders = this.renderFolderLinks(folderNames, {
      pinned: this.state.showAllFolders ? true : null,
    });

    const showAll = this.renderShowAllFolders();
    if (showAll) {
      sidebarFolders.push(showAll);
    }

    if (this.state.showAllFolders) {
      const sidebarFolderNames = new Set(folderNames);
      const otherFolderNames = _.filter(
        this.props.folderNames,
        (name) => !sidebarFolderNames.has(name)
      );
      sidebarFolders.push(
        ...this.renderFolderLinks(_.sortBy(otherFolderNames), { pinned: false })
      );
    }

    return sidebarFolders;
  }

  renderAccounts() {
    return _.map(this.props.accounts, (account) => (
      <li
        key={account.name}
        className={this.props.currentAccount === account.name ? "active" : ""}
      >
        <a onClick={_.partial(this.setAccountFilter, account.name)}>
          <i className={`fa fa-${getAccountIconName(account)} white`}></i>{" "}
          {account.name}
        </a>
      </li>
    ));
  }

  renderUpdateLink() {
    if (!systemStore.props.hasUpdate) {
      return null;
    }

    return <li className="small">
      <a onClick={() => {
        this.setState({ isUpdating: true })
        AppService.OpenLink(systemStore.props.update!.link)
      }}>
        <i className="fa fa-arrow-up green"></i> Download update
      </a>
    </li>

    // if (this.state.isUpdating) {
    //   return <li className="small"><a className="disabled">
    //     <i className="fa fa-refresh fa-spin green"></i> Updating
    //   </a></li>
    // }

    // if (this.state.updateNeedsRestart) {
    //   return <li className="small"><a onClick={AppService.RestartAfterUpdate}>
    //     <i className="fa fa-refresh green"></i> Restart to update
    //   </a></li>;
    // }

    // return <li className="small">
    //   <a onClick={() => {
    //     this.setState({ isUpdating: true })
    //     AppService.DoUpdate().then(() => {
    //       this.setState({
    //         isUpdating: false,
    //         updateNeedsRestart: true,
    //       })
    //     });
    //   }}>
    //     <i className="fa fa-arrow-up green"></i> Update Kanmail
    //   </a>
    // </li>
  }

  render() {
    return (
      <div id="filters">
        {!systemStore.props.isLicensed && (
          <ul>
            <li>
              <a onClick={() => {
                AppService.OpenPurchaseLicenseDialog();
                trackEvent("SidebarOpenLicense");
              }}>
                <i className="fa fa-shopping-cart green"></i> Purchase Kanmail
              </a>
            </li>
          </ul>
        )}

        <ul>
          {this.renderMainFolderLinks()}
          {this.renderOtherFolderLinks()}
        </ul>

        <ul>
          <li className={!this.props.currentAccount ? "active" : ""}>
            <a onClick={_.partial(this.setAccountFilter, null)}>
              <i className="fa fa-globe white"></i> All accounts
            </a>
          </li>
          {this.renderAccounts()}
        </ul>

        <ul className="window-links">
          {this.renderUpdateLink()}
          <li className="small">
            <a onClick={() => {
              AppService.OpenSettingsWindow();
              trackEvent("SidebarOpenSettings");
            }}>
              <i className="fa fa-cog"></i> Settings
            </a>
          </li>
          {settingsStore.props.system.showHelpButton && (
            <li className="small">
              <a onClick={() => {
                AppService.OpenLink("https://kanmail.io/support");
                trackEvent("SidebarOpenHelp");
              }}>
                <i className="fa fa-support"></i> Help
              </a>
            </li>
          )}
        </ul>

        {/*<ul>{this.renderUpdateLink()}</ul>*/}
      </div >
    );
  }
}
