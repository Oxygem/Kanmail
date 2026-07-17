import _ from "lodash";

import { AppService } from "../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import type EmailColumnThread from "./components/emails/EmailColumnThread.tsx";
import type EmailsApp from "./components/emails/EmailsApp.tsx";
import cheatsheetStore from "./stores/cheatsheet.ts";
import commandStore from "./stores/command.ts";
import requestStore from "./stores/request.ts";
import searchStore from "./stores/search.ts";
import settingsStore from "./stores/settings.ts";
import threadStore from "./stores/thread.ts";
import tooltipStore from "./stores/tooltip.ts";
import { trackEvent } from "./util/analytics.ts";
import { openCommandBar } from "./util/commands.tsx";
import { ensureInView, isPointInElement } from "./util/element.ts";
import {
  getNextColumnThreadComponent,
  getNextThreadComponent,
  getPreviousColumnThreadComponent,
  getPreviousThreadComponent,
} from "./util/threads.ts";
import { clampZoom, ZOOM_STEP } from "./zoom.ts";

export interface Binding {
  key: string;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  ctrl?: boolean;
}

type Scope = "always" | "global" | "thread";

interface Shortcut {
  id: string;
  description: string;
  scope: Scope;
  defaults: Binding[];
  handler: (ev: KeyboardEvent, binding: Binding) => void;
}

function normalizeKey(key: string): string {
  // Single printable characters → lowercase. Named keys (Enter, Escape,
  // ArrowUp, etc.) keep their canonical casing so the binding string is
  // human-readable.
  if (key.length === 1) {
    return key.toLowerCase();
  }
  return key;
}

export function bindingFromEvent(ev: KeyboardEvent): Binding {
  return {
    key: normalizeKey(ev.key),
    shift: ev.shiftKey || undefined,
    alt: ev.altKey || undefined,
    meta: ev.metaKey || undefined,
    ctrl: ev.ctrlKey || undefined,
  };
}

export function bindingToString(b: Binding): string {
  const parts: string[] = [];
  if (b.ctrl) parts.push("Ctrl");
  if (b.alt) parts.push("Alt");
  if (b.meta) parts.push("Meta");
  if (b.shift) parts.push("Shift");
  parts.push(b.key);
  return parts.join("+");
}

export function bindingsEqual(a: Binding, b: Binding): boolean {
  return bindingToString(a) === bindingToString(b);
}

export function bindingToDisplayString(b: Binding): string {
  const labels: Record<string, string> = {
    " ": "Space",
    arrowup: "↑",
    arrowdown: "↓",
    arrowleft: "←",
    arrowright: "→",
  };
  const key = labels[b.key.toLowerCase()] ?? labels[b.key] ?? b.key;
  const parts: string[] = [];
  if (b.ctrl) parts.push("Ctrl");
  if (b.alt) parts.push("Alt");
  if (b.meta) parts.push("⌘");
  if (b.shift) parts.push("Shift");
  parts.push(key === " " ? "Space" : key);
  return parts.join("+");
}

class Keyboard {
  // Refcounted suspension. Each suspend() returns a release function.
  // Empty set = enabled. Anything in the set = disabled.
  private suspenders = new Set<symbol>();

  // The thread currently in keyboard focus (hovered or last-selected).
  currentComponent: EmailColumnThread | null = null;

  // The mounted EmailsApp, used to find a thread to focus when entering
  // keyboard mode with nothing selected.
  emailsApp: EmailsApp | null = null;

  // id → Shortcut
  private shortcuts = new Map<string, Shortcut>();

  // Tracks suspenders that have been alive a long time so we surface
  // accidentally-stuck keyboard state.
  private suspenderTimers = new Map<symbol, ReturnType<typeof setTimeout>>();

  // Last real cursor position from window-level mousemove. EmailColumnThread
  // uses isCursorStationary() to ignore element-level mouse events that fire
  // when the DOM reflows under a stationary cursor — column auto-scroll
  // shifting threads under the pointer, or a thread being archived causing
  // its neighbours to move. The window listener fires in the bubble phase,
  // so when an element handler runs, this still holds the *previous* cursor
  // position; a real movement compares as different, a stationary cursor
  // compares as equal.
  private lastCursorX = -1;
  private lastCursorY = -1;

  constructor() {
    window.addEventListener("keydown", this.handleKeyboardEvents);
    window.addEventListener("mousemove", this.handleWindowMouseMove);
  }

  private handleWindowMouseMove = (ev: MouseEvent) => {
    // After a scroll the browser re-syncs hover state by dispatching a fake
    // mousemove at the unchanged cursor position (e.g. keyboard nav scrolling
    // the focused thread into view). That isn't the user moving the mouse, so
    // it must not deactivate keyboard mode.
    if (this.isCursorStationary(ev.clientX, ev.clientY)) {
      return;
    }

    this.lastCursorX = ev.clientX;
    this.lastCursorY = ev.clientY;

    // Moving the mouse deactivates keyboard mode: if the focused thread isn't
    // under the cursor, clear it (when it is, hover/mouseleave takes over).
    // Skipped while a thread or the command bar is open, where mouse hover is
    // intentionally ignored.
    if (threadStore.isOpen || commandStore.props.open) {
      return;
    }
    if (this.currentComponent) {
      const el = this.currentComponent.element;
      if (!el || !isPointInElement(ev.clientX, ev.clientY, el)) {
        this.setThreadComponent(null);
      }
    }
  };

  isCursorStationary = (clientX: number, clientY: number): boolean =>
    clientX === this.lastCursorX && clientY === this.lastCursorY;

  /* Suspension */

  suspend = (reason: string = "anonymous"): (() => void) => {
    const token = Symbol(reason);
    this.suspenders.add(token);

    const timer = setTimeout(() => {
      console.warn(
        `[keyboard] Suspender "${reason}" has been active for 30s — possible stuck-disabled bug`,
      );
    }, 30_000);
    this.suspenderTimers.set(token, timer);

    return () => {
      if (!this.suspenders.has(token)) {
        return;
      }
      this.suspenders.delete(token);
      const t = this.suspenderTimers.get(token);
      if (t) {
        clearTimeout(t);
        this.suspenderTimers.delete(token);
      }
    };
  };

  isSuspended = (): boolean => this.suspenders.size > 0;

  /* Registry */

  register = (shortcut: Shortcut) => {
    if (this.shortcuts.has(shortcut.id)) {
      // Overwrite rather than bail so hot-reloads pick up the latest handler —
      // the registry is a module-level singleton that survives HMR, and the
      // re-run registration would otherwise keep the stale handler.
      console.warn(`[keyboard] Re-registering shortcut ${shortcut.id}`);
    }
    this.shortcuts.set(shortcut.id, shortcut);
  };

  getShortcuts = (): Shortcut[] => Array.from(this.shortcuts.values());

  getBindingsFor = (id: string): Binding[] => {
    const override = settingsStore.props.system?.keyboardShortcuts?.[id];
    if (override) {
      return override;
    }
    return this.shortcuts.get(id)?.defaults ?? [];
  };

  getDefaultsFor = (id: string): Binding[] =>
    this.shortcuts.get(id)?.defaults ?? [];

  // Find which shortcut (if any) matches the given binding right now.
  // Linear over registered shortcuts — cheap given the small count, and
  // keeps the source of truth (settings overrides) lazy/live.
  private findShortcut(binding: Binding): Shortcut | undefined {
    const exact = bindingToString(binding);
    const exactMatch = this.matchBindingString(exact);
    if (exactMatch) return exactMatch;

    // Shift-stripped fallback: Shift acts as a "reverse direction" modifier
    // for handlers that read ev.shiftKey (archive/trash). This lets us store
    // a single binding (e.g. Enter) and still respond to Shift+Enter.
    if (binding.shift) {
      const withoutShift = bindingToString({ ...binding, shift: undefined });
      return this.matchBindingString(withoutShift);
    }
    return undefined;
  }

  private matchBindingString(bindingStr: string): Shortcut | undefined {
    for (const shortcut of this.shortcuts.values()) {
      for (const b of this.getBindingsFor(shortcut.id)) {
        if (bindingToString(b) === bindingStr) {
          return shortcut;
        }
      }
    }
    return undefined;
  }

  /* Thread selection */

  setThreadComponent = (component: EmailColumnThread | null) => {
    if (component === this.currentComponent) {
      return;
    }

    if (this.currentComponent) {
      this.currentComponent.setHover(false);
    }

    this.currentComponent = component;

    if (component) {
      component.setHover();
    }
  };

  selectThread = (
    thread: EmailColumnThread | null | undefined,
    scrollToBlockOption: ScrollLogicalPosition | false,
  ): boolean => {
    if (!thread) return false;

    this.setThreadComponent(thread);

    if (thread.element && scrollToBlockOption !== false) {
      ensureInView(thread.element as HTMLElement, {
        behavior: "smooth",
        block: scrollToBlockOption,
      });
    }

    if (threadStore.isOpen) {
      thread.handleClick();
    }

    return true;
  };

  // Enter keyboard mode from cold by focusing the first visible thread.
  selectFirstThread = () =>
    this.selectThread(this.emailsApp?.getFirstThreadComponent(), "nearest");

  selectNextThread = () =>
    this.selectThread(getNextThreadComponent(this.currentComponent), "end");

  selectPreviousThread = () =>
    this.selectThread(
      getPreviousThreadComponent(this.currentComponent),
      "start",
    );

  selectNextColumnThread = () =>
    this.selectThread(
      getNextColumnThreadComponent(this.currentComponent),
      "nearest",
    );

  selectPreviousColumnThread = () =>
    this.selectThread(
      getPreviousColumnThreadComponent(this.currentComponent),
      "nearest",
    );

  // Used by the command bar when a move completes.
  setMovingCurrentThread = () => {
    const component = this.currentComponent;
    if (!component) return;
    this.selectNextThread() ||
      this.selectPreviousThread() ||
      threadStore.close();
    component.setIsMoving();
  };

  /* Click-handler helpers — used by the per-thread action icons. These
     operate on currentComponent (set by hover) so the icon click acts on
     the row the user actually pointed at. */

  // Loose `any` event type — these are called from both keyboard handlers
  // and React onClick handlers; the body only uses shiftKey/stopPropagation
  // which both shapes support.
  archiveCurrentThread = (ev: any) => {
    const component = this.currentComponent;
    if (!component) return;
    selectAfterThreadAction(ev);
    component.handleClickArchive(ev);
  };

  trashCurrentThread = (ev: any) => {
    const component = this.currentComponent;
    if (!component) return;
    selectAfterThreadAction(ev);
    component.handleClickTrash(ev);
  };

  starCurrentThread = (ev: any) => {
    this.currentComponent?.handleClickStar(ev);
  };

  startMoveCurrentThread = (ev: any) => {
    this.currentComponent?.handleClickMove(ev);
  };

  /* Event handling */

  handleKeyboardEvents = (ev: KeyboardEvent) => {
    const binding = bindingFromEvent(ev);
    const shortcut = this.findShortcut(binding);

    if (!shortcut) {
      return;
    }

    // "always" shortcuts run even when suspended (e.g. Escape-out of modals).
    // "global" needs the keyboard not suspended.
    // "thread" needs both not-suspended and a current thread component.
    if (shortcut.scope !== "always" && this.isSuspended()) {
      return;
    }

    if (shortcut.scope === "thread" && !this.currentComponent) {
      // Arrow keys with nothing selected enter keyboard mode at the first
      // thread rather than doing nothing. Other thread shortcuts (archive,
      // trash, ...) stay inert so they can't act on an unintended thread.
      if (shortcut.id.startsWith("nav.")) {
        ev.preventDefault();
        this.selectFirstThread();
      }
      return;
    }

    ev.preventDefault();
    tooltipStore.hide();
    shortcut.handler(ev, binding);
  };
}

const keyboard = new Keyboard();

/* === Default shortcut registrations === */

// Event type is loose because this is called from both real keyboard events
// (registered shortcuts) and React mouse events (icon clicks).
function selectAfterThreadAction(ev: { shiftKey: boolean }) {
  if (ev.shiftKey) {
    keyboard.selectPreviousThread() ||
      keyboard.selectNextThread() ||
      threadStore.close();
  } else {
    keyboard.selectNextThread() ||
      keyboard.selectPreviousThread() ||
      threadStore.close();
  }
}

// Escape is always-on so overlays (search/control/cheatsheet) close even when
// keyboard is suspended by their own input. Closing the thread is gated to
// not-suspended so it doesn't dismiss threads behind a settings panel.
keyboard.register({
  id: "modal.close",
  description: "Close open modal, search, or thread",
  scope: "always",
  defaults: [{ key: "Escape" }],
  handler: () => {
    if (cheatsheetStore.props.open) {
      cheatsheetStore.close();
      return;
    }
    if (searchStore.props.isSearching) {
      searchStore.close();
      return;
    }
    if (commandStore.props.open) {
      commandStore.pop();
      return;
    }
    if (!keyboard.isSuspended() && threadStore.isOpen) {
      threadStore.close();
      trackEvent("KeyboardThreadClose");
    }
  },
});

keyboard.register({
  id: "app.compose",
  description: "Compose a new email",
  scope: "global",
  defaults: [{ key: "c" }],
  handler: () => {
    trackEvent("KeyboardOpenSend");
    AppService.OpenSendWindow({});
  },
});

keyboard.register({
  id: "app.commandBar",
  description: "Open command palette",
  scope: "global",
  defaults: [
    { key: "k", meta: true },
    { key: "k", ctrl: true },
  ],
  handler: () => openCommandBar(),
});

// "always" scope to match native menu behaviour — settings should open even
// when a modal or input has the keyboard suspended.
keyboard.register({
  id: "app.settings",
  description: "Open settings",
  scope: "always",
  defaults: [
    { key: ",", meta: true },
    { key: ",", ctrl: true },
  ],
  handler: () => {
    trackEvent("KeyboardOpenSettings");
    AppService.OpenSettingsWindow();
  },
});

keyboard.register({
  id: "app.search",
  description: "Focus search",
  scope: "global",
  defaults: [{ key: "/" }],
  handler: () => {
    searchStore.focus();
    trackEvent("KeyboardToggleSearch");
  },
});

keyboard.register({
  id: "app.undo",
  description: "Undo last action",
  scope: "global",
  defaults: [{ key: "z" }],
  handler: () => {
    requestStore.undo();
    trackEvent("KeyboardUndo");
  },
});

// Persisting via settingsStore applies the zoom (settings store calls
// applyZoom) and broadcasts to other windows via SettingsChangedEvent.
function changeZoom(next: number) {
  const clamped = clampZoom(next);
  if (clamped === clampZoom(settingsStore.props.system.zoom)) {
    return;
  }
  settingsStore.props.system.zoom = clamped;
  settingsStore.putSettings(["system"]);
  trackEvent("KeyboardZoom");
}

// "always" scope so zoom works even over settings/search/modals. Both `=` and
// `+` are registered for zoom-in; the keyboard's shift-stripped fallback maps
// Cmd+Shift+= (which reports "+") onto the "+" binding.
keyboard.register({
  id: "app.zoomIn",
  description: "Increase interface zoom",
  scope: "always",
  defaults: [
    { key: "=", meta: true },
    { key: "=", ctrl: true },
    { key: "+", meta: true },
    { key: "+", ctrl: true },
  ],
  handler: () => changeZoom((settingsStore.props.system.zoom || 1) + ZOOM_STEP),
});

keyboard.register({
  id: "app.zoomOut",
  description: "Decrease interface zoom",
  scope: "always",
  defaults: [
    { key: "-", meta: true },
    { key: "-", ctrl: true },
  ],
  handler: () => changeZoom((settingsStore.props.system.zoom || 1) - ZOOM_STEP),
});

keyboard.register({
  id: "app.zoomReset",
  description: "Reset interface zoom",
  scope: "always",
  defaults: [
    { key: "0", meta: true },
    { key: "0", ctrl: true },
  ],
  handler: () => changeZoom(1),
});

keyboard.register({
  id: "app.cheatsheet",
  description: "Show keyboard shortcuts",
  scope: "global",
  defaults: [{ key: "?", shift: true }],
  handler: () => {
    cheatsheetStore.toggle();
  },
});

keyboard.register({
  id: "thread.open",
  description: "Open current thread",
  scope: "thread",
  defaults: [{ key: " " }],
  handler: () => {
    keyboard.currentComponent?.handleClick();
  },
});

keyboard.register({
  id: "thread.archive",
  description: "Archive (hold Shift to select previous instead of next)",
  scope: "thread",
  defaults: [{ key: "Enter" }],
  handler: (ev) => keyboard.archiveCurrentThread(ev),
});

keyboard.register({
  id: "thread.trash",
  description: "Move to trash (hold Shift to select previous instead of next)",
  scope: "thread",
  defaults: [{ key: "Backspace" }],
  handler: (ev) => keyboard.trashCurrentThread(ev),
});

keyboard.register({
  id: "thread.star",
  description: "Star/unstar current thread",
  scope: "thread",
  defaults: [{ key: "s" }],
  handler: (ev) => keyboard.starCurrentThread(ev),
});

keyboard.register({
  id: "thread.move",
  description: "Move thread to another folder",
  scope: "thread",
  defaults: [{ key: "m" }],
  handler: (ev) => keyboard.startMoveCurrentThread(ev),
});

keyboard.register({
  id: "thread.reply",
  description: "Reply to current thread",
  scope: "thread",
  defaults: [{ key: "r" }],
  handler: (ev) => keyboard.currentComponent?.handleClickReply(ev),
});

keyboard.register({
  id: "thread.replyAll",
  description: "Reply-all to current thread",
  scope: "thread",
  defaults: [{ key: "a" }],
  handler: (ev) => keyboard.currentComponent?.handleClickReplyAll(ev),
});

keyboard.register({
  id: "thread.forward",
  description: "Forward current thread",
  scope: "thread",
  defaults: [{ key: "f" }],
  handler: (ev) => keyboard.currentComponent?.handleClickForward(ev),
});

keyboard.register({
  id: "nav.previousThread",
  description: "Previous thread",
  scope: "thread",
  defaults: [{ key: "ArrowUp" }],
  handler: () => keyboard.selectPreviousThread(),
});

keyboard.register({
  id: "nav.nextThread",
  description: "Next thread",
  scope: "thread",
  defaults: [{ key: "ArrowDown" }],
  handler: () => keyboard.selectNextThread(),
});

keyboard.register({
  id: "nav.previousColumn",
  description: "Previous column",
  scope: "thread",
  defaults: [{ key: "ArrowLeft" }],
  handler: () => keyboard.selectPreviousColumnThread(),
});

keyboard.register({
  id: "nav.nextColumn",
  description: "Next column",
  scope: "thread",
  defaults: [{ key: "ArrowRight" }],
  handler: () => keyboard.selectNextColumnThread(),
});

// @ts-ignore
window.keyboard = keyboard;
export default keyboard;
