import _ from 'lodash';

import { get, post } from 'util/requests';


export function makeDragElement(element) {
    // Note this is based on my original drag code merged into `pywebview`:
    // https://github.com/r0x0r/pywebview/blob/master/webview/js/drag.py
    if (!window.KANMAIL_FRAMELESS || !element) {
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


export function makeNoDragElement(element) {
    if (!window.KANMAIL_FRAMELESS || !element) {
        return;
    }

    element.addEventListener('mousedown', ev => ev.stopPropagation());
}


function saveWindowPosition() {
    const windowSettings = {
        // Unused (Python/backend provides these currently)
        left: window.screenX,
        top: window.screenY,
        width: window.innerWidth,
        height: window.innerHeight,
        // Used to cap the width/height to the screen size
        screen_width: window.screen.width,
        screen_height: window.screen.height,
    }
    post('/api/settings/window', windowSettings);
}


export function createWindowPositionHandlers() {
    window.addEventListener('resize', _.debounce(saveWindowPosition, 100));
}


function getWindowId() {
    const url = new URL(window.location.href);
    return url.searchParams.get('window_id');
}


export function closeWindow() {
    get('/close-window', {window_id: getWindowId()});
}


export function resizeWindow(width, height) {
    get('/resize-window', {window_id: getWindowId(), width, height});
}


export function openWindow(path, options={}) {
    if (!options.width) {
        options.width = 600;
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
        confirm_close: true,
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
        resizable: false,
        title: 'Kanmail Meta',
        width: 300,
        height: 230,
    });
}

export function openSend() {
    openWindow('/send', {title: 'Kanmail: compose email'});
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
