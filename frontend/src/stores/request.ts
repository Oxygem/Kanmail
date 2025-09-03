import _ from "lodash";

import { EventName } from "../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { Call, Events } from "../../wails/runtime.js";
import { BaseStore } from "./base.tsx";
import settingsStore from "./settings.ts";

export interface RuntimeError {
  action: string;
  message: string;
  isNetwork?: boolean;
  accountName?: string;
  folderName?: string;
  error?: any;
}

export interface IRequestStoreProps {
  fetchRequests: Map<number, string>;
  pushRequests: Map<number, string>;
  pendingRequests: [NodeJS.Timeout, [() => void, () => void]][];
  // TODO
  requestErrors: RuntimeError[];
  networkErrors: RuntimeError[];
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
    };
  }

  addError = (action: string, err: any) => {
    const newError: RuntimeError = {
      action,
      message: err.message,
    };
    let target = this.props.requestErrors;
    if (err.cause) {
      if (err.cause.isNetwork) {
        newError.isNetwork = true;
        target = this.props.networkErrors;
      }
      if (err.cause.accountName) {
        newError.accountName = err.cause.accountName;
      }
      if (err.cause.folderName) {
        newError.folderName = err.cause.folderName;
      }
      if (err.cause.error) {
        newError.error = err.cause.error;
      }
    }
    target.unshift(newError);
    this.triggerUpdate();
    console.debug("[requestStore] Received error", err, newError);
  }

  clearNetworkErrors = () => {
    console.debug("[requestStore] Clearing network errors...");
    this.props.networkErrors = [];
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

  addUndoable = (callback: () => void, onUndo: () => void) => {
    const callbackUndoTuple: [() => void, () => void] = [callback, onUndo];

    // Create a timeout to actually make the request
    const requestTimeoutId = setTimeout(() => {
      // Remove self from pending requests
      this.props.pendingRequests = _.filter(
        this.props.pendingRequests,
        (pendingRequest) => pendingRequest[1] !== callbackUndoTuple
      );
      this.triggerUpdate();

      // Actually make the request
      callback();
    }, settingsStore.props.system.undoMS);

    // Push to pending requests
    this.props.pendingRequests.push([requestTimeoutId, callbackUndoTuple]);
    this.triggerUpdate();
  };

  undo = () => {
    if (this.props.pendingRequests.length <= 0) {
      return;
    }

    // Pop the latest pending request off the list
    const [requestTimeoutId, callbackUndoTuple] =
      this.props.pendingRequests.pop()!;

    // Remove the pending timeout
    clearTimeout(requestTimeoutId);
    this.triggerUpdate();

    // And run the undo function
    callbackUndoTuple[1]();
  };

  close = async () => {
    // Firstly kick all the pending requests
    _.each(this.props.pendingRequests, req => {
      clearTimeout(req[0]);
      // Run the callback function
      req[1][0]();
    });

    // Now wait for requests to stop coming in
    while (this.props.fetchRequests.size > 0 || this.props.pushRequests.size > 0) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

const requestStore = new RequestStore();

// @ts-ignore
window.requestStore = requestStore;
export default requestStore;

// Pass global JS errors to the requestStore
window.onerror = (message, source, lineno, colno, e) => {
  requestStore.addError("JS error", e);
  return false;
};

window.onunhandledrejection = (ev) => {
  requestStore.addError("Promise rejection", ev.reason);
}
