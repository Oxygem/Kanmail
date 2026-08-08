import React from "react";

import { Thread } from "../stores/emails/base.ts";

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

export function startThreadDrag(ev: React.DragEvent, item: ThreadDragItem) {
  currentItem = item;
  ev.dataTransfer.effectAllowed = "move";
  ev.dataTransfer.setData(THREAD_MIME_TYPE, item.oldColumn);
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
