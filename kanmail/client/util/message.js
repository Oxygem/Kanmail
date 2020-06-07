import { openWindow } from 'window.js';
import { post } from 'util/requests.js';


export function openReplyToMessageWindow(message, options={}) {
    options.message = message;

    post('/create-send', options).then((data) => openWindow(data.endpoint, {
        title: `Kanmail: reply to ${message.subject}`,
    }));
}
