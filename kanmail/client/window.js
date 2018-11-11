import { post } from 'util/requests';


const position = {};

function saveWindowPosition() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const left = window.screenX;
    const top = window.screenY;

    const changed = (
        position.width !== width
        || position.height !== height
        || position.left !== left
        || position.top !== top
    );

    position.width = width;
    position.height = height;
    position.left = left;
    position.top = top;

    if (changed) {
        post('/api/settings/window', position);
    }
}


export default function createWindowPositionHandlers() {
    window.addEventListener('resize', saveWindowPosition);
    window.addEventListener('mouseover', saveWindowPosition);
}
