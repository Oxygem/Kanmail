import _ from "lodash";

import {
  BodyPartResp,
  FetchPartsMap,
} from "../../bindings/github.com/oxygem/kanmail/internal/emails/index.ts";
import { Flag } from "../../bindings/github.com/emersion/go-imap/v2/index.ts";
import { EmailsService } from "../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { Address, BodyPart } from "../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { BaseStore } from "./base.tsx";
import { getColumnStore } from "./columns.ts";
import contactsStore from "./contacts.ts";
import { IEmail, Thread, makeThread } from "./emails/base.ts";
import { getEmailStore } from "./emails/controller.ts";
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
  // Messages that were unread when they arrived in the reader, captured before
  // opening marks them read
  newMessageIds: Set<string>;
  // Bumped each time a different thread opens, so the reader can reset
  openCount: number;
}

function makeDefaults(openCount = 0): IThreadStoreProps {
  return {
    thread: null,
    messages: null,
    fetching: false,
    newMessageIds: new Set(),
    openCount,
  };
}

interface messagePartsMap {
  part: BodyPart;
  accountMessageId: string;
}

type folderUids = Map<string, { [_: string]: messagePartsMap }>;

interface messageLocation {
  folderName: string;
  uid: number;
}

// For a thread pick the folder/UID to fetch each message from, re-using folders where possible to
// minimize fetches required. Messages removed from every folder since the thread was built have
// no location.
function getThreadMessageLocations(thread: Thread): Map<string, messageLocation> {
  const haveFolders: Set<string> = new Set();
  const locations: Map<string, messageLocation> = new Map();

  _.each(thread, message => {
    // The app-generated welcome message renders as a component, there's no
    // body content to fetch
    if (message.welcome) {
      return;
    }

    const folderNames = _.keys(message.folderUids);
    if (folderNames.length === 0) {
      return;
    }

    const folderName = _.find(folderNames, f => haveFolders.has(f)) || folderNames[0];
    haveFolders.add(folderName);
    locations.set(message.accountMessageId, {
      folderName: folderName,
      uid: message.folderUids[folderName],
    });
  });

  return locations;
}

// For a thread collect a mapping of folder -> []uid to fetch email content
function getFolderUidsForThread(thread: Thread, locations: Map<string, messageLocation>): folderUids {
  return _.reduce(
    thread,
    (memo: folderUids, message) => {
      const location = locations.get(message.accountMessageId);
      if (!location) {
        return memo;
      }

      if (!memo.has(location.folderName)) {
        memo.set(location.folderName, {});
      }
      const part = message.partHTML || message.partDisplay || new BodyPart();
      memo.get(location.folderName)![location.uid] = {
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

    this.props = makeDefaults(this.props.openCount);

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
    this.props.newMessageIds = new Set();
    this.props.openCount++;
    this.triggerUpdate();

    // Now, actually load the thread!
    this.loadThread(thread, knownBodies);

    // Loading captured which messages are new, from here on they're read - the
    // server only reports it on the next sync
    getEmailStore().setEmailsRead(_.map(thread, message => message.accountMessageId));
  }

  loadThread(thread: Thread, knownBodies?: Map<string, string>) {
    const currentLoadId = ++this.loadId;

    _.each(thread, message => {
      if (!message.welcome && !_.includes(message.flags, Flag.FlagSeen)) {
        this.props.newMessageIds.add(message.accountMessageId);
      }
    });

    const locations = getThreadMessageLocations(thread);
    // Thread snapshots (the open thread, column threads awaiting re-threading) keep messages
    // that have since been removed from every folder, there's nothing left to fetch or show
    const messages = _.filter(
      thread,
      message => message.welcome || locations.has(message.accountMessageId),
    );

    // First split thread up into one per account
    const accountToThread = new Map<string, Thread>();
    // Track set of all senders we need to check
    const threadSenders = new Set<Address>;

    messages.forEach(email => {
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
      const folderUids = getFolderUidsForThread(aThread, locations);
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

      const messagesWithBody: IThreadMessage[] = _.map(messages, (message) => {
        // Only show images if allowed from all senders
        const allShow: boolean[] = [];
        _.each(message.from, a => {
          allShow.push(senderShowImagesMap.get(contactsStore.addrKey(a)) || false);
        });
        const showImages = !_.includes(allShow, false);
        const part = fetchedParts.get(message.accountMessageId);
        return {
          body: part?.data || "",
          trusted: part?.trusted || false,
          showImages: showImages,
          ...message,
          // The email's own folderName/uid are from when it was first seen and go stale once it
          // moves, use the live location the body was fetched from for any follow-up requests
          ...locations.get(message.accountMessageId),
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
