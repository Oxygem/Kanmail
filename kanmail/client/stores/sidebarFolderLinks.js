import { BaseStore } from "stores/base.jsx";

class SidebarFolderLinkStore extends BaseStore {
  /*
        Per-sidebar folder link store to show unread/highlight counts.
    */

  static storeKey = "sidebarFolderLinkStore";

  constructor() {
    super();

    this.props = {
      unreadCount: 0,
    };
  }

  setUnreadCount(count) {
    this.props.unreadCount = count;
    this.triggerUpdate(["unreadCount"]);
  }
}

// Export the sidebar folder link store factory/cache
//

const sidebarFolderLinkStores = {};

export function getSidebarFolderLinkStore(name) {
  if (!sidebarFolderLinkStores[name]) {
    console.debug(`Creating new sidebar folder link store: ${name}.`);

    sidebarFolderLinkStores[name] = new SidebarFolderLinkStore(name);
  }

  return sidebarFolderLinkStores[name];
}
