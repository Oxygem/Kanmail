import _ from "lodash";

import { AppService } from "../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { EventName } from "../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { Call, Events } from "../../wails/runtime.js";
import { trackError } from "../util/analytics.ts";
import { BaseStore } from "./base.tsx";
import settingsStore from "./settings.ts";

export interface RuntimeError {
  action: string;
  message: string;
  isNetwork?: boolean;
  requiresReauth?: boolean;
  accountID?: string;
  folderName?: string;
  error?: any;
  cause?: any;
}

export interface PendingRequest {
  id: number;
  name: string;
  timeoutId: ReturnType<typeof setTimeout>;
  callback: () => void;
  onUndo: () => void;
}

export interface IRequestStoreProps {
  fetchRequests: Map<number, string>;
  pushRequests: Map<number, string>;
  pendingRequests: PendingRequest[];
  requestErrors: RuntimeError[];
  networkErrors: RuntimeError[];
  accountAuthErrors: Map<string, RuntimeError>;
}

class RequestStore extends BaseStore {
  static storeKey = "requestStore";

  props: IRequestStoreProps;
  counter: number = 0;

  constructor() {
    super();

    this.props = {
      // Actual requests
      fetchRequests: new Map(),
      pushRequests: new Map(),
      pendingRequests: [],
      // Request error "log"
      requestErrors: [],
      // Network error "log" (ie dodgy network, not "errors")
      networkErrors: [],
      // Accounts needing re-authentication
      accountAuthErrors: new Map(),
    };
  }

  addError = (action: string, rawErr: unknown, options: { silent?: boolean } = {}) => {
    // Global handlers can deliver anything here: undefined (cross-origin
    // onerror, bare Promise.reject()), strings, or real Errors.
    const err: Error =
      rawErr instanceof Error
        ? rawErr
        : new Error(
          rawErr === undefined || rawErr === null
            ? `Unknown error (${action})`
            : String(rawErr),
        );

    const newError: RuntimeError = {
      action,
      message: err.message,
    };
    let target = this.props.requestErrors;
    const cause = (err as any).cause;
    if (cause) {
      if (cause.isNetwork) {
        newError.isNetwork = true;
        target = this.props.networkErrors;
      }
      if (cause.accountID) {
        newError.accountID = cause.accountID;
      }
      if (cause.folderName) {
        newError.folderName = cause.folderName;
      }
      if (cause.error) {
        newError.error = cause.error;
      }
      if (cause.requiresReauth) {
        newError.requiresReauth = true;
      }
    }

    if (newError.requiresReauth && newError.accountID) {
      console.debug("[requestStore] Account needs reconnecting", newError);
      this.addAuthError(newError.accountID, newError.message, {
        ...options,
        report: true,
      });
      return;
    }

    // Silent errors skip the UI lists (the caller shows its own feedback or
    // the failure is non-fatal background work) but still follow the same
    // classification & tracking policy below.
    if (!options.silent) {
      target.unshift(newError);
      this.triggerUpdate();
    }
    console.debug("[requestStore] Received error", err, newError);

    if (!newError.isNetwork) {
      trackError(action, newError.message, err?.stack, {
        accountID: newError.accountID,
        folderName: newError.folderName,
      });
    }
  }

  addAuthError = (
    accountID: string,
    message: string,
    options: { silent?: boolean; report?: boolean } = {},
  ) => {
    if (this.props.accountAuthErrors.has(accountID)) {
      return;
    }
    trackError("AccountReauthRequired", message, undefined, { accountID });
    if (options.silent) {
      return;
    }
    this.props.accountAuthErrors.set(accountID, {
      action: "Account needs reconnecting",
      message,
      accountID,
      requiresReauth: true,
    });
    this.triggerUpdate();

    // A failed request only fails in the window that made it - hand it to the
    // backend so the other windows (and any opened later) hear about it too.
    if (options.report) {
      AppService.EmitAccountAuthError(accountID, message).catch((e) => {
        console.error("[requestStore] Failed to report auth error", e);
      });
    }
  };

  // Retracts a single account's prompt, on word from the backend that it has
  // authenticated again.
  clearAuthError = (accountID: string) => {
    if (!this.props.accountAuthErrors.delete(accountID)) {
      return;
    }
    console.debug("[requestStore] Account reconnected, clearing auth error", accountID);
    this.triggerUpdate();
  };

  clearAuthErrors = () => {
    if (!this.props.accountAuthErrors.size) {
      return;
    }
    console.debug("[requestStore] Clearing account auth errors...");
    this.props.accountAuthErrors.clear();
    this.triggerUpdate();
  };

  clearNetworkErrors = () => {
    console.debug("[requestStore] Clearing network errors...");
    this.props.networkErrors = [];
    this.triggerUpdate();
  };

  clearRequestErrors = () => {
    console.debug("[requestStore] Clearing request errors...");
    this.props.requestErrors = [];
    this.triggerUpdate();
  };

  async doFetchRequest(name: string, r: Promise<any>): Promise<any> {
    const n = this.counter;
    this.counter++;

    console.debug("[requestStore] Start request", n, name);
    this.props.fetchRequests.set(n, name);
    this.triggerUpdate();
    try {
      const res = await r
      console.debug("[requestStore] Complete request (success)", n, name);
      this.props.fetchRequests.delete(n)
      this.triggerUpdate();
      return res
    } catch (e) {
      console.debug("[requestStore] Complete request (error)", n, name);
      this.props.fetchRequests.delete(n)
      this.triggerUpdate();
      throw e
    }
  }

  async doPushRequest(name: string, r: Promise<any>): Promise<any> {
    const n = this.counter;
    this.counter++;

    this.props.pushRequests.set(n, name);
    this.triggerUpdate();
    try {
      const res = await r
      this.props.pushRequests.delete(n)
      this.triggerUpdate();
      return res
    } catch (e) {
      this.props.pushRequests.delete(n)
      this.triggerUpdate();
      throw e
    }
  }

  addUndoable = (name: string, callback: () => void, onUndo: () => void) => {
    const id = this.counter;
    this.counter++;

    // Create a timeout to actually make the request
    const requestTimeoutId = setTimeout(() => {
      // Remove self from pending requests
      this.props.pendingRequests = _.filter(
        this.props.pendingRequests,
        (pendingRequest) => pendingRequest.id !== id
      );
      this.triggerUpdate();

      // Actually make the request
      callback();
    }, settingsStore.props.system.undoMS);

    // Push to pending requests
    this.props.pendingRequests.push({
      id,
      name,
      timeoutId: requestTimeoutId,
      callback,
      onUndo,
    });
    this.triggerUpdate();
  };

  undo = () => {
    if (this.props.pendingRequests.length <= 0) {
      return;
    }

    // Pop the latest pending request off the list
    const pendingRequest = this.props.pendingRequests.pop()!;

    // Remove the pending timeout
    clearTimeout(pendingRequest.timeoutId);
    this.triggerUpdate();

    // And run the undo function
    pendingRequest.onUndo();
  };

}

const requestStore = new RequestStore();

// @ts-ignore
window.requestStore = requestStore;
export default requestStore;

Events.On(EventName.AccountAuthErrorEvent, (ev) => {
  const { accountID, message } = ev.data as { accountID: string; message: string };
  requestStore.addAuthError(accountID, message);
});

// Backfill any account auth errors at window start
AppService.GetAccountAuthErrors().then((errors) => {
  _.each(errors, (message, accountID) => {
    requestStore.addAuthError(accountID, message || "");
  });
}).catch((e) => {
  console.error("[requestStore] Failed to load account auth errors", e);
});

// An account that authenticates is proof its credentials work now, whatever a
// request still in flight from before the reconnect goes on to report.
Events.On(EventName.AccountAuthClearedEvent, (ev) => {
  requestStore.clearAuthError(ev.data as string);
});

// Any settings save may be the reconnect that fixes an account - and it's the
// settings window that performs it, so the prompt here can't clear itself.
// Drop them all and let the next sync re-report whatever is still broken,
// mirroring how the backend clears its own watch markers.
Events.On(EventName.SettingsChangedEvent, () => {
  requestStore.clearAuthErrors();
});

// Pass global JS errors to the requestStore. Called explicitly by main.tsx for
// every window - as an import side-effect some windows (license) never got them.
export const installGlobalErrorHandlers = () => {
  window.onerror = (message, source, lineno, colno, e) => {
    // e is undefined for cross-origin script errors - synthesize one
    requestStore.addError(
      "JS error",
      e ?? new Error(`${String(message)} (${source}:${lineno}:${colno})`),
    );
    return false;
  };

  window.onunhandledrejection = (ev) => {
    requestStore.addError("Promise rejection", ev.reason);
  };
};
