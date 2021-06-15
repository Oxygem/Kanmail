import _ from 'lodash';
import 'whatwg-fetch';
import URI from 'urijs';

import requestStore from 'stores/request.js';


let currentCriticalRequestNonce = null;


function handleReponse(response, method, options) {
    const criticalRequestNonce = options.criticalRequestNonce;
    if (criticalRequestNonce && criticalRequestNonce !== currentCriticalRequestNonce) {
        const error = new Error(`Blocked due to old critical request nonce (current=${currentCriticalRequestNonce}, response=${criticalRequestNonce}, url=${response.url})!`);
        error.isCriticalRequestNonceFailure = true;
        throw error;
    }

    if (!response.ok) {
        // Read the body and pass to the requestStore
        return response.text().then(body => {
            let data = {
                url: response.url,
                status: response.status,
                errorName: 'unknown',
                errorMessage: body,
            };

            // If possible parse out the JSON error - but expect that sometimes
            // we might not even have that if the server *really* broke.
            try {
                body = JSON.parse(body);
                data.errorMessage = body.error_message;
                data.errorName = body.error_name;
                data.json = body;
            } catch(e) {
                data.jsonError = e;
            }

            if (response.status == 503) {
                requestStore.addNetworkError(data);
            } else if (!options.ignoreStatus || !_.includes(options.ignoreStatus, response.status)) {
                requestStore.addRequestError(data);
            }

            const error = new Error(`Error fetching: ${method} ${response.url}`);
            error.data = data;
            error.isNetworkResponseFailure = true;
            throw error;
        });
    }

    if (response.status == 204) {
        return;
    }

    return response.json();
}


function get_or_delete(method, url, query={}, options={}) {
    const uri = URI(url);

    if (options.criticalRequestNonce) {
        currentCriticalRequestNonce = options.criticalRequestNonce;
    }

    return (
        fetch(uri.query(query), {
            method,
            headers: {
                'Kanmail-Session-Token': window.KANMAIL_SESSION_TOKEN,
            }
        })
        .then(response => handleReponse(response, method, options))
    );
}


export const get = _.partial(get_or_delete, 'GET');
export const delete_ = _.partial(get_or_delete, 'DELETE');


function post_or_put(method, url, data, options={}) {
    const uri = URI(url);

    if (options.criticalRequestNonce) {
        currentCriticalRequestNonce = options.criticalRequestNonce;
    }

    return (
        fetch(uri, {
            method,
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json',
                'Kanmail-Session-Token': window.KANMAIL_SESSION_TOKEN,
            },
        })
        .then(response => handleReponse(response, method, options))
    );
}

export const post = _.partial(post_or_put, 'POST');
export const put = _.partial(post_or_put, 'PUT');
