import _ from 'lodash';
import 'whatwg-fetch';
import URI from 'urijs';

import requestStore from 'stores/request.js';


let currentCriticalRequestNonce = null;


function handleReponse(response, criticalRequestNonce=false) {
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

            const error = new Error(`Error fetching: ${response.url}`);
            error.data = body;
            throw error;
        });
    }

    if (response.status == 204) {
        return;
    }

    return response.json();
}


function get_or_delete(type, url, query={}, criticalRequestNonce=false) {
    console.debug(`Requesting: ${type} ${url}?:`, query, criticalRequestNonce);

    const uri = URI(url);

    if (criticalRequestNonce) {
        currentCriticalRequestNonce = criticalRequestNonce;
    }

    return (
        fetch(uri.query(query), {
            method: type,
        })
        .then(response => {
            console.debug(`Response to ${type} ${url}`, response);
            return handleReponse(response, criticalRequestNonce);
        })
    );
}


export const get = _.partial(get_or_delete, 'GET');
export const delete_ = _.partial(get_or_delete, 'DELETE');


function post_or_put(type, url, data, criticalRequestNonce=false) {
    console.debug(`Requesting: ${type} ${url} with: `, data, criticalRequestNonce);

    const uri = URI(url);

    if (criticalRequestNonce) {
        currentCriticalRequestNonce = criticalRequestNonce;
    }

    return (
        fetch(uri, {
            method: type,
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json',
            },
        })
        .then(response => {
            console.debug(`Response to ${type} ${url}`, response);
            return handleReponse(response, criticalRequestNonce);
        })
    );
}

export const post = _.partial(post_or_put, 'POST');
export const put = _.partial(post_or_put, 'PUT');
