import { get, post } from 'util/requests';


function saveWindowPosition() {
    post('/api/settings/window');
}


export function createWindowPositionHandlers() {
    window.addEventListener('resize', saveWindowPosition);
}


export function closeWindow() {
    const url = new URL(window.location.href);
    const windowId = url.searchParams.get('window_id');
    get('/close-window', {window_id: windowId});
}
