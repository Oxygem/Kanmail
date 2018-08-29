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

    postWithUndo = (onUndo, ...args) => {
        // Add to list of pending to-do requests
        // Set timeout (according to settings) to issue this.makeRequest,
        // and remove self from pending list
        // Push (timeoutId, onUndo) to pending list
        args;
    }

    undo = () => {
        // Pop latest item on pending list
        // clearTimeout the timeoutId
        // Call onUndo
    }
}

const requestStore = new RequestStore();
export default requestStore;
