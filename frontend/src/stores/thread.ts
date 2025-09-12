import _ from "lodash";

import {
  BodyPartResp,
  FetchPartsMap,
} from "../../bindings/github.com/oxygem/kanmail/internal/emails/index.ts";
import { EmailsService } from "../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { Address, BodyPart } from "../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { BaseStore } from "./base.tsx";
import { getColumnStore } from "./columns.ts";
import contactsStore from "./contacts.ts";
import { IEmail, Thread, makeThread } from "./emails/base.ts";
import requestStore from "./request.ts";
import settingsStore from "./settings.ts";

export interface IThreadMessage extends IEmail {
  body: string;
  // Flag on whether the the data is trusted so can be rendered as-is
  trusted: boolean;
  // Whether to show images by default
  showImages: boolean;
}

export interface IThreadStoreProps {
  thread: Thread | null;
  messages: IThreadMessage[] | null;
  fetching: boolean;
}

function makeDefaults(): IThreadStoreProps {
  return {
    thread: null,
    messages: null,
    fetching: false,
  };
}

interface messagePartsMap {
  part: BodyPart;
  accountMessageId: string;
}

type folderUids = Map<string, { [_: string]: messagePartsMap }>;

// For a thread collect a mapping of folder -> []uid to fetch email content, will ideally re-use
// folders where possible to minimize fetches required.
function getFolderUidsForThread(thread: Thread): folderUids {
  const haveFolders: Set<string> = new Set();
  return _.reduce(
    thread,
    (memo: folderUids, message) => {
      let uid: number = 0;
      let folderName: string = "";

      // First look for a UID in a folder we're already fetching from
      if (haveFolders.size > 0) {
        _.each(message.folderUids, (fUid: number, fName: string) => {
          if (haveFolders.has(fName)) {
            uid = fUid;
            folderName = fName;
          }
        })
      }

      // Fallback to the first folder/UID
      if (folderName === "") {
        folderName = _.keys(message.folderUids)[0];
        uid = message.folderUids[folderName];
      }

      if (!memo.has(folderName)) {
        memo.set(folderName, {});
      }
      const part = message.partHTML || message.partDisplay || new BodyPart();
      memo.get(folderName)![uid] = {
        part: part,
        accountMessageId: message.accountMessageId,
      }
      return memo;
    },
    new Map(),
  );
}

// Global store of the currently open thread
class ThreadStore extends BaseStore {
  static storeKey = "threadStore";

  isOpen: boolean;
  onClose: () => void;
  propps: IThreadStoreProps;
  columnContainer: Element;

  constructor() {
    super();

    this.isOpen = false;
    this.props = makeDefaults();
  }

  hideOtherColumns(targetColumn) {
    const otherColumns = _.concat(settingsStore.getCurrentColumns());
    otherColumns.forEach(c => {
      if (c == targetColumn) {
        getColumnStore(c).showAndOpen();
      } else {
        getColumnStore(c).hide();
      }
    })
  }

  showAllColumns() {
    const otherColumns = _.concat(settingsStore.getCurrentColumns());
    otherColumns.forEach(c => {
      getColumnStore(c).show();
    })
  }

  reloadThread() {
    this.loadThread(this.props.thread);
  }

  close(isClosing = true) {
    if (!this.isOpen) {
      return;
    }

    this.props = makeDefaults();

    if (isClosing) {
      this.showAllColumns();
      this.triggerUpdate();
    }

    if (this.onClose) {
      this.onClose();
    }

    this.isOpen = false;
  }

  open(component, thread, onClose) {
    if (this.isOpen) {
      this.close(false);
    }

    this.hideOtherColumns(component.props.columnId);

    this.onClose = onClose;
    this.isOpen = true;

    // Set to empty thread (loading icon)
    this.props.messages = [];
    this.props.thread = thread;
    this.triggerUpdate();

    // Now, actually load the thread!
    this.loadThread(thread);
  }

  loadThread(thread: Thread) {
    // First split thread up into one per account
    const accountToThread = new Map<string, Thread>();
    // Track set of all senders we need to check
    const threadSenders = new Set<Address>;

    thread.forEach(email => {
      _.each(email.from, a => { threadSenders.add(a) })

      const accountName = email.accountName
      const accountThread = accountToThread.get(accountName)

      if (!accountThread) {
        accountToThread.set(accountName, makeThread([email]))
      } else {
        accountToThread.set(accountName, makeThread(accountThread.concat(email)))
      }
    })

    this.props.fetching = true;
    this.triggerUpdate(["fetching"]);

    // Map of sender -> default show images
    let senderShowImagesMap: Map<string, boolean>;

    const requests: Promise<any>[] = [
      contactsStore.shouldSendersShowImages(Array.from(threadSenders)).then(m => senderShowImagesMap = m),
    ];

    const fetchedParts = new Map<string, BodyPartResp | null>();

    // For each account get folder/parts pairs and for each of those create the fetch requests
    accountToThread.forEach((aThread, accountName) => {
      const folderUids = getFolderUidsForThread(aThread);
      folderUids.forEach((messageParts, folderName) => {
        const parts: FetchPartsMap = {};
        const uidToAccountMessageId: { [_: string]: string } = {};
        _.each(messageParts, (messagePart, uid) => {
          parts[uid] = messagePart.part;
          uidToAccountMessageId[uid] = messagePart.accountMessageId;
        })
        requests.push(
          requestStore.doFetchRequest(
            `Fetch ${Object.keys(uidToAccountMessageId).length} parts in ${accountName}/${folderName}`,
            EmailsService.GetAccountFolderEmailsContentParts(accountName, folderName, parts),
          ).then(resp => {
            _.each(resp, (partResp, uid) => {
              const key = uidToAccountMessageId[uid];
              fetchedParts.set(key, partResp);
            })
          }).catch(e => {
            requestStore.addError("Failed to load threads", e);
            _.each(uidToAccountMessageId, msgID => {
              fetchedParts.set(msgID, new BodyPartResp({
                data: "Failed to load this email",
              }))
            })
          })
        );
      })
    })

    // Once all loaded, assign all the emails and trigger the update
    Promise.allSettled(requests).then(resps => {
      _.each(resps, r => {
        if (r.status !== "fulfilled") {
          requestStore.addError("Failed to get folder email parts", r.reason);
          // requestStore.addBindingError({
          //   errorName: "Failed to get folder email parts",
          //   errorMessage: r.reason,
          // })
        }
      });

      if (!this.props.fetching) {
        console.debug("Ignoring returned emails, thread already closed!");
        return;
      }

      const messagesWithBody: IThreadMessage[] = _.map(thread, (message) => {
        // Only show images if allowed from all senders
        const allShow: boolean[] = [];
        _.each(message.from, a => {
          allShow.push(senderShowImagesMap.get(contactsStore.addrKey(a)) || false);
        });
        const showImages = !_.includes(allShow, false);
        const part = fetchedParts.get(message.accountMessageId);
        console.log("SHOWIMG", showImages, allShow, part);
        return {
          body: part?.data || "",
          trusted: part?.trusted || false,
          showImages: showImages,
          ...message,
        }
      });

      // Sort in date-ascending order (only the last email is visible by default)
      this.props.messages = _.orderBy(
        messagesWithBody,
        (message) => {
          const date = new Date(message.date);
          return date;
        },
        "asc"
      );
      this.props.fetching = false;

      this.triggerUpdate();
    });
  }
}

const threadStore = new ThreadStore();
export default threadStore;
