import React from 'react';

// import { closeWindow, maximizeWindow, minimizeWindow } from 'window.js';
import { makeDragElement } from 'window.js';



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
        if (!window.KANMAIL_FRAMELESS) {
            return null;
        }

        return <div id="drag-bar" ref={makeDragElement}></div>;
    }
}
