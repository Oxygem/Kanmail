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
        response.text().then(body => {
            let data = {
                url: response.url,
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

            requestStore.addError(data);
        });

        throw new Error(`Error fetching: ${response.url}`);
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
