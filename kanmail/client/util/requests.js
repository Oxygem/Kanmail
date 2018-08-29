import 'whatwg-fetch';
import URI from 'urijs';

import { addMessage, deleteMessage } from 'util/messages.js';

let currentCriticalRequestNonce = null;


function handleReponse(response, criticalRequestNonce=false) {
    if (criticalRequestNonce && criticalRequestNonce !== currentCriticalRequestNonce) {
        throw new Error(`Blocked due to old critical request nonce (current=${currentCriticalRequestNonce}, response=${criticalRequestNonce}!`);
    }

    if (response.status >= 300 || response.status < 200) {
        const message = addMessage(
            `Invalid API response GET ${response.url}: ${response.status}`,
            'critical',
        );

        setTimeout(() => deleteMessage(message), 10000);

        throw new Error(response);
    }

    if (response.status == 204) {
        return;
    }

    return response.json();
}


export function get(url, query={}, criticalRequestNonce=false) {
    console.debug(`Requesting: GET ${url}?:`, query, criticalRequestNonce);

    const uri = URI(url);

    if (criticalRequestNonce) {
        currentCriticalRequestNonce = criticalRequestNonce;
    }

    return (
        fetch(uri.query(query))
        .then(response => {
            console.debug(`Response to GET ${url}`, response);
            return handleReponse(response, criticalRequestNonce);
        })
    );
}


export function post(url, data, criticalRequestNonce=false) {
    console.debug(`Requesting: POST ${url} with: `, data, criticalRequestNonce);

    const uri = URI(url);

    if (criticalRequestNonce) {
        currentCriticalRequestNonce = criticalRequestNonce;
    }

    return (
        fetch(uri, {
            method: 'POST',
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json',
            },
        })
        .then(response => {
            console.debug(`Response to POST ${url}`, response);
            return handleReponse(response, criticalRequestNonce);
        })
    );
}
