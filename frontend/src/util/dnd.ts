import React from "react";

import { Thread } from "../stores/emails/base.ts";
import settingsStore from "../stores/settings.ts";
import { formatAddress } from "./string.js";

/*
    Threads are only ever dragged within a single window, so the payload - which
    includes a live reference to the source component - lives here rather than in
    the drag event's dataTransfer, which can only carry strings.
*/
export interface ThreadDragItem {
  messageUids: number[];
  oldColumn: string;
  accountID: string;
  sourceThreadComponent: any;
  thread: Thread;
}

// Drags don't start unless *some* data is set, and a Kanmail specific type
// keeps threads from being dropped into text inputs as plain text.
const THREAD_MIME_TYPE = "application/x-kanmail-thread";

let currentItem: ThreadDragItem | null = null;

// Where the cursor sits within the drag image - just inside the leading edge,
// vertically centred, so the chip hangs off the pointer
const DRAG_IMAGE_GRAB_X = 16;

/*
    The default drag image is a bitmap of the card itself: column wide, mostly
    empty space, and snapshotted with whatever hover state it had. Replace it
    with a compact chip naming what's being moved.

    The browser snapshots a real rendered element, so the chip has to be in the
    document and painted - it's positioned offscreen rather than hidden, and
    removed once the snapshot has been taken.
*/
function setThreadDragImage(ev: React.DragEvent, item: ThreadDragItem) {
  const latestEmail = item.thread[0];

  const element = document.createElement("div");
  element.className = "thread-drag-image";

  const dot = document.createElement("span");
  dot.className = "dot";
  dot.style.background =
    settingsStore.getAccountAccentColor(item.accountID) || "var(--faint)";

  const sender = document.createElement("span");
  sender.className = "sender";
  sender.textContent = formatAddress(latestEmail.from[0], true);

  const subject = document.createElement("span");
  subject.className = "subject";
  subject.textContent = latestEmail.subject;

  element.append(dot, sender, subject);

  if (item.thread.length > 1) {
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = `${item.thread.length}`;
    element.append(count);
  }

  document.body.appendChild(element);
  ev.dataTransfer.setDragImage(
    element,
    DRAG_IMAGE_GRAB_X,
    element.offsetHeight / 2
  );

  // The snapshot is taken after this handler returns, so the element can only
  // go once the browser has had a frame to read it
  requestAnimationFrame(() => element.remove());
}

export function startThreadDrag(ev: React.DragEvent, item: ThreadDragItem) {
  currentItem = item;
  ev.dataTransfer.effectAllowed = "move";
  ev.dataTransfer.setData(THREAD_MIME_TYPE, item.oldColumn);
  setThreadDragImage(ev, item);
}

export function endThreadDrag() {
  currentItem = null;
}

/*
    Build the drag event handlers for a folder drop target. The target toggles
    its own `hover` class rather than setting state, avoiding a re-render of the
    (potentially very large) column on every drag enter/leave.
*/
export function createThreadDropTarget(
  getFolderName: () => string,
  onDrop: (item: ThreadDragItem, folderName: string) => void
) {
  // Enter/leave also fire for child elements, so count the depth rather than
  // dropping the highlight as soon as the cursor crosses a thread
  let depth = 0;

  const getDroppableItem = () => {
    if (currentItem && currentItem.oldColumn !== getFolderName()) {
      return currentItem;
    }
  };

  const clearHover = (element: Element) => {
    depth = 0;
    element.classList.remove("hover");
  };

  return {
    onDragEnter: (ev: React.DragEvent) => {
      if (!getDroppableItem()) {
        return;
      }
      ev.preventDefault();
      depth += 1;
      ev.currentTarget.classList.add("hover");
    },
    onDragOver: (ev: React.DragEvent) => {
      if (!getDroppableItem()) {
        return;
      }
      // Without accepting the drag here the browser never fires onDrop
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
    },
    onDragLeave: (ev: React.DragEvent) => {
      depth -= 1;
      if (depth <= 0) {
        clearHover(ev.currentTarget);
      }
    },
    onDrop: (ev: React.DragEvent) => {
      const item = getDroppableItem();
      clearHover(ev.currentTarget);
      if (!item) {
        return;
      }
      ev.preventDefault();
      endThreadDrag();
      onDrop(item, getFolderName());
    },
  };
}
