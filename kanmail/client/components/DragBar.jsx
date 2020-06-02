import React from 'react';

// import { closeWindow, maximizeWindow, minimizeWindow } from 'window.js';


const makeDragElement = element => {
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



export default class DragBar extends React.Component {
    // renderButtons() {
    //     if (window.KANMAIL_PLATFORM !== 'Linux') {
    //         return null;
    //     }

    //     return <div>
    //         <a onClick={closeWindow}>
    //             <i className="close fa fa-times" />
    //         </a>
    //         <a onClick={minimizeWindow}>
    //             <i className="minimize fa fa-minus" />
    //         </a>
    //         <a onClick={maximizeWindow}>
    //             <i className="maximize fa fa-expand" />
    //         </a>
    //     </div>;
    // }

    render() {
        return <div id="drag-bar" ref={makeDragElement}></div>;
    }
}
