import _ from 'lodash';

import { get, post } from 'util/requests';


function saveWindowPosition() {
    post('/api/settings/window');
}


export function createWindowPositionHandlers() {
    window.addEventListener('resize', _.debounce(saveWindowPosition, 100));
}


export function closeWindow() {
    const url = new URL(window.location.href);
    const windowId = url.searchParams.get('window_id');
    get('/close-window', {window_id: windowId});
}


export function openWindow(path, options) {
    if (window.KANMAIL_IS_APP) {
        get('/open-window', {
            url: path,
            ...options,
        });
    } else {
        window.open(
            path,
            options.title,
            `width=${options.width},height=${options.height}`,
        );
    }
}

export function openSettings() {
    openWindow('/settings', {
        unique_key: 'settings',
        width: 800,
        height: 600,
        title: 'Kanmail Settings',
    });
}

export function openContacts() {
    openWindow('/contacts', {
        unique_key: 'contacts',
        width: 800,
        height: 600,
        title: 'Kanmail Contacts',
    });
}

export function openLink(link) {
    if (window.KANMAIL_IS_APP) {
        get('/open-link', {
            url: link,
        });
    } else {
        window.open(link);
    }
}

export function openFile(filename) {
    get('/open-link', {
        url: `file://${filename}`,
    });
}
