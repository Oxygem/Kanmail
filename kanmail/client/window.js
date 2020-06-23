import _ from 'lodash';

import { get, post } from 'util/requests';


export function makeDragElement(element) {
    if (!element) {
        return;
    }

    var initialX = 0;
    var initialY = 0;

    function onMouseMove(ev) {
        var x = ev.screenX - initialX;
        var y = ev.screenY - initialY;
        window.pywebview._bridge.call('moveWindow', [x, y], null);
    }

    function onMouseUp() {
        window.removeEventListener('mousemove', onMouseMove);
    }

    function onMouseDown(ev) {
        initialX = ev.clientX;
        initialY = ev.clientY;
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('mousemove', onMouseMove);
    }

    element.addEventListener('mousedown', onMouseDown);
}


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


export function minimizeWindow() {
    const url = new URL(window.location.href);
    const windowId = url.searchParams.get('window_id');
    get('/minimize-window', {window_id: windowId});
}


export function maximizeWindow() {
    const url = new URL(window.location.href);
    const windowId = url.searchParams.get('window_id');
    get('/maximize-window', {window_id: windowId});
}


export function openWindow(path, options={}) {
    if (!options.width) {
        options.width = 800;
    }
    if (!options.height) {
        options.height = 800;
    }

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
        title: 'Kanmail Settings',
    });
}

export function openContacts() {
    openWindow('/contacts', {
        unique_key: 'contacts',
        title: 'Kanmail Contacts',
    });
}

export function openLicense() {
    const height = window.KANMAIL_LICENSED ? 230 : 320;

    openWindow('/license', {
        unique_key: 'license',
        title: 'Kanmail License',
        width: 540,
        height: height,
    });
}


export function openMeta() {
    openWindow('/meta', {
        unique_key: 'meta',
        title: 'Kanmail Meta',
        width: 300,
        height: 200,
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
