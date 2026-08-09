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
  columnContainer: Element;
  private loadId: number = 0;

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
    if (!this.isOpen || !this.props.thread) {
      return;
    }
    this.loadThread(this.props.thread);
  }

  // Replace the open thread snapshot with an updated one (e.g. after an
  // optimistically-injected sent reply). knownBodies pre-seeds body content for
  // messages whose HTML we already have locally, skipping the IMAP fetch.
  replaceCurrentThread(newThread: Thread, knownBodies?: Map<string, string>) {
    if (!this.isOpen) {
      return;
    }
    this.props.thread = newThread;
    this.props.messages = [];
    this.triggerUpdate();
    this.loadThread(newThread, knownBodies);
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

  open(component, thread, onClose, knownBodies?: Map<string, string>) {
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
    this.loadThread(thread, knownBodies);
  }

  loadThread(thread: Thread, knownBodies?: Map<string, string>) {
    const currentLoadId = ++this.loadId;

    // First split thread up into one per account
    const accountToThread = new Map<string, Thread>();
    // Track set of all senders we need to check
    const threadSenders = new Set<Address>;

    thread.forEach(email => {
      _.each(email.from, a => { threadSenders.add(a) })

      const accountID = email.accountID
      const accountThread = accountToThread.get(accountID)

      if (!accountThread) {
        accountToThread.set(accountID, makeThread([email]))
      } else {
        accountToThread.set(accountID, makeThread(accountThread.concat(email)))
      }
    })

    this.props.fetching = true;
    this.triggerUpdate(["fetching"]);

    // Map of sender -> default show images
    let senderShowImagesMap: Map<string, boolean> = new Map();

    const requests: Promise<any>[] = [
      contactsStore.shouldSendersShowImages(Array.from(threadSenders)).then(m => senderShowImagesMap = m),
    ];

    const fetchedParts = new Map<string, BodyPartResp | null>();

    // Pre-seed body content for messages we already have locally (e.g. just-sent replies).
    if (knownBodies) {
      knownBodies.forEach((body, accountMessageId) => {
        fetchedParts.set(accountMessageId, new BodyPartResp({
          data: body,
          trusted: true,
        }));
      });
    }

    // For each account get folder/parts pairs and for each of those create the fetch requests
    accountToThread.forEach((aThread, accountID) => {
      const folderUids = getFolderUidsForThread(aThread);
      folderUids.forEach((messageParts, folderName) => {
        const parts: FetchPartsMap = {};
        const uidToAccountMessageId: { [_: string]: string } = {};
        _.each(messageParts, (messagePart, uid) => {
          if (fetchedParts.has(messagePart.accountMessageId)) {
            // Already have the body inline — skip the remote fetch for this UID.
            return;
          }
          parts[uid] = messagePart.part;
          uidToAccountMessageId[uid] = messagePart.accountMessageId;
        })
        if (Object.keys(parts).length === 0) {
          return;
        }
        requests.push(
          requestStore.doFetchRequest(
            `Fetch ${Object.keys(uidToAccountMessageId).length} parts in ${settingsStore.getAccountName(accountID)}/${folderName}`,
            EmailsService.GetAccountFolderEmailsContentParts(accountID, folderName, parts),
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

      if (!this.isOpen || currentLoadId !== this.loadId) {
        console.debug("Ignoring stale thread load response");
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
