import _ from 'lodash';
import 'whatwg-fetch';
import URI from 'urijs';

import requestStore from 'stores/request.js';


let currentCriticalRequestNonce = null;


function handleReponse(response, method, criticalRequestNonce=false) {
    if (criticalRequestNonce && criticalRequestNonce !== currentCriticalRequestNonce) {
        throw new Error(`Blocked due to old critical request nonce (current=${currentCriticalRequestNonce}, response=${criticalRequestNonce}!`);
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
            } catch(e) {
                data.jsonError = e;
            }

            if (response.status == 503) {
                requestStore.addNetworkError(data);
            } else {
                requestStore.addRequestError(data);
            }

            const error = new Error(`Error fetching: ${method} ${response.url}`);
            error.data = data;
            throw error;
        });
    }

    if (response.status == 204) {
        return;
    }

    return response.json();
}


function get_or_delete(method, url, query={}, criticalRequestNonce=false) {
    console.debug(`Requesting: ${method} ${url}?:`, query, criticalRequestNonce);

    const uri = URI(url);

    if (criticalRequestNonce) {
        currentCriticalRequestNonce = criticalRequestNonce;
    }

    return (
        fetch(uri.query(query), {
            method,
        })
        .then(response => {
            console.debug(`Response to ${method} ${url}`, response);
            return handleReponse(response, method, criticalRequestNonce);
        })
    );
}


export const get = _.partial(get_or_delete, 'GET');
export const delete_ = _.partial(get_or_delete, 'DELETE');


function post_or_put(method, url, data, criticalRequestNonce=false) {
    console.debug(`Requesting: ${method} ${url} with: `, data, criticalRequestNonce);

    const uri = URI(url);

    if (criticalRequestNonce) {
        currentCriticalRequestNonce = criticalRequestNonce;
    }

    return (
        fetch(uri, {
            method,
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json',
            },
        })
        .then(response => {
            console.debug(`Response to ${method} ${url}`, response);
            return handleReponse(response, method, criticalRequestNonce);
        })
    );
}

export const post = _.partial(post_or_put, 'POST');
export const put = _.partial(post_or_put, 'PUT');
