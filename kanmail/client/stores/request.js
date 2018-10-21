import _ from 'lodash';

import { BaseStore } from 'stores/base.jsx';
import settingsStore from 'stores/settings.js';

import { get, post } from 'util/requests.js';


class RequestStore extends BaseStore {
    static storeKey = 'requestStore';

    constructor() {
        super();

        this.props = {
            // Actual requests
            fetchRequests: [],
            pushRequests: [],
            pendingPushRequests: [],
            // Request error "log"
            requestErrors: [],
        };
    }

    addError = (errorData) => {
        console.error(errorData);
        this.props.requestErrors.push(errorData);
        this.triggerUpdate();
    }

    makeRequest = (method, requestsPropKey, message, args) => {
        const request = method(...args);

        const requestMessageTuple = [request, message];
        this.props[requestsPropKey].push(requestMessageTuple);
        this.triggerUpdate();

        const removeRequest = () => {
            // Remove self
            this.props[requestsPropKey] = _.filter(
                this.props[requestsPropKey],
                requestItem => requestItem[0] !== request,
            );
            this.triggerUpdate();
        }

        request.then((...promiseArgs) => {
            removeRequest();
            return promiseArgs;
        });
        request.catch((e) => {
            removeRequest();
            throw e;
        });

        return request;
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

    requestStore.addError({
        errorName: `JS error: ${name}`,
        errorMessage: errorMessage,
    });

    return false;
}
