import _ from 'lodash';

import { BaseStore } from 'stores/base.jsx';

import { get, post } from 'util/requests.js';


class RequestStore extends BaseStore {
    static storeKey = 'requestStore';

    constructor() {
        super();

        this.props = {
            fetchRequests: [],
            pushRequests: [],
            pendingPushRequests: [],
        };
    }

    makeRequest = (method, requestsPropKey, args) => {
        const request = method(...args);

        this.props[requestsPropKey].push(request);
        this.triggerUpdate();

        const removeRequest = () => {
            this.props[requestsPropKey] = _.without(
                this.props[requestsPropKey],
                request,
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

    get = (...args) => {
        return this.makeRequest(get, 'fetchRequests', args);
    }

    post = (...args) => {
        return this.makeRequest(post, 'pushRequests', args);
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
        }, 5000);

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
            this.props.pendingPushRequests.shift()
        );

        // Remove the pending timeout
        clearTimeout(requestTimeoutId);
        this.triggerUpdate();

        // And run the undo function
        callbackUndoTuple[1]();
    }
}

const requestStore = new RequestStore();
export default requestStore;
