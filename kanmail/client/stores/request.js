import _ from 'lodash';

import { BaseStore } from 'stores/base.jsx';
import settingsStore from 'stores/settings.js';

import { get, post } from 'util/requests.js';

const MAX_REQUESTS = 4;


class RequestStore extends BaseStore {
    static storeKey = 'requestStore';

    constructor() {
        super();

        this.pendingRequests = [];
        this.currentRequests = 0;

        this.props = {
            // Actual requests
            fetchRequests: [],
            pushRequests: [],
            pendingPushRequests: [],
            // Request error "log"
            requestErrors: [],
            // Network error "log" (ie dodgy network, not "errors")
            networkErrors: [],
        };
    }

    addRequestError = (errorData) => {
        console.error('Received request error:', errorData);
        this.props.requestErrors.push(errorData);
        this.triggerUpdate();
    }

    addNetworkError = (errorData) => {
        console.error('Received network error: ', errorData);
        this.props.networkErrors.push(errorData);
        this.triggerUpdate();
    }

    makeRequest = (method, requestsPropKey, message, args) => {
        const response = (resolve, reject) => {
            const makeActualRequest = () => {
                this.currentRequests += 1;

                // Create the request and complete handler
                const request = method(...args);
                const completeRequest = () => {
                    // Remove self
                    this.props[requestsPropKey] = _.filter(
                        this.props[requestsPropKey],
                        requestItem => requestItem[0] !== makeActualRequest,
                    );
                    this.triggerUpdate();
                    this.currentRequests -= 1;
                    this.makeNextPendingRequest();
                }

                // Now we simply resolve/reject the outer promise returning
                // the actual request promise.
                request.then(() => {
                    completeRequest();
                    resolve(request);
                });
                request.catch(() => {
                    completeRequest();
                    reject(request);
                });
            }

            const requestMessageTuple = [makeActualRequest, message];
            this.props[requestsPropKey].push(requestMessageTuple);
            this.triggerUpdate();

            this.pendingRequests.push(makeActualRequest);
            this.makeNextPendingRequest();
        }

        return new Promise(response);
    }

    makeNextPendingRequest = () => {
        if (!this.pendingRequests.length) {
            return;
        }

        if (this.currentRequests > MAX_REQUESTS) {
            return;
        }

        this.pendingRequests.shift()();
    }

    get = (message, ...args) => {
        return this.makeRequest(get, 'fetchRequests', message, args);
    }

    post = (message, ...args) => {
        return this.makeRequest(post, 'pushRequests', message, args);
    }

    addUndoable = (callback, onUndo) => {
        const callbackUndoTuple = [callback, onUndo];

        // Create a timeout to actually make the request
        const requestTimeoutId = setTimeout(() => {
            // Remove self from pending requests
            this.props.pendingPushRequests = _.filter(
                this.props.pendingPushRequests,
                pendingRequest => pendingRequest[1] !== callbackUndoTuple,
            );
            this.triggerUpdate();

            // Actually make the request
            callback();
        }, settingsStore.props.systemSettings.undo_ms);

        // Push to pending requests
        this.props.pendingPushRequests.push(
            [requestTimeoutId, callbackUndoTuple],
        );
        this.triggerUpdate();
    }

    undo = () => {
        if (this.props.pendingPushRequests.length <= 0) {
            return;
        }

        // Pop the latest pending request off the list
        const [requestTimeoutId, callbackUndoTuple] = (
            this.props.pendingPushRequests.pop()
        );

        // Remove the pending timeout
        clearTimeout(requestTimeoutId);
        this.triggerUpdate();

        // And run the undo function
        callbackUndoTuple[1]();
    }
}

const requestStore = new RequestStore();

window.requestStore = requestStore;
export default requestStore;


// Pass global JS errors to the requestStore
window.onerror = (message, source, lineno, colno, e) => {
    const name = e ? e.name : 'Unknown';
    const errorMessage = e ? e.message : message;

    requestStore.addRequestError({
        errorName: `JS error: ${name}`,
        errorMessage: errorMessage,
    });

    return false;
}
