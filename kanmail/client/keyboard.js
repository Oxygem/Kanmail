import _ from 'lodash';

import threadStore from 'stores/thread.js';
import requestStore from 'stores/request.js';
import controlStore from 'stores/control.js';
import searchStore from 'stores/search.js';

import { ensureInView } from 'util/element.js';
import {
    getNextThreadComponent,
    getPreviousThreadComponent,
    getNextColumnThreadComponent,
    getPreviousColumnThreadComponent,
    getMoveDataFromThreadComponent,
} from 'util/threads.js';

const keys = {
    // Letters
    Z: 90,
    M: 77,
    C: 67,
    S: 83,

    // Special
    DELETE: 8,
    ENTER: 13,
    ESCAPE: 27,
    SPACE: 32,

    // Arrows
    ARROW_LEFT: 37,
    ARROW_UP: 38,
    ARROW_RIGHT: 39,
    ARROW_DOWN: 40,
};
const validKeyCodes = _.values(keys);


class Keyboard {
    constructor() {
        // Start disabled by default
        this.disabled = true;

        this.currentComponent = null;

        window.addEventListener('keydown', this.handleKeyboardEvents);
    }

    disable = () => {
        this.disabled = true;
    }

    enable = () => {
        this.disabled = false;
    }

    setThreadComponent = (component) => {
        if (component === this.currentComponent) {
            console.error('Attempted to set same component in focus!');
            return;
        }

        if (this.currentComponent) {
            this.currentComponent.setHover(false);
        }

        this.currentComponent = component;

        if (component) {
            component.setHover();
        }
    }

    selectThread = (thread, scrollToBlockOption) => {
        if (thread) {
            this.setThreadComponent(thread);

            if (thread.element) {
                ensureInView(thread.element, {
                    behavior: 'smooth',
                    block: scrollToBlockOption,
                });
            }

            if (threadStore.isOpen) {
                thread.handleClick();
            }

            return true;
        }
    }

    selectNextThread = () => {
        const nextThread = getNextThreadComponent(this.currentComponent);
        return this.selectThread(nextThread, 'end');
    }

    selectPreviousThread = () => {
        const previousThread = getPreviousThreadComponent(this.currentComponent);
        return this.selectThread(previousThread, 'start');
    }

    selectNextColumnThread = () => {
        const nextColumnThread = getNextColumnThreadComponent(this.currentComponent);
        return this.selectThread(nextColumnThread);
    }

    selectPreviousColumnThread = () => {
        const previousColumnThread = getPreviousColumnThreadComponent(this.currentComponent);
        return this.selectThread(previousColumnThread);
    }

    openCurrentThread = (ev) => {
        this.currentComponent.handleClick(ev);
    }

    archiveCurrentThread = (ev) => {
        const component = this.currentComponent;
        this.selectNextThread() || this.selectPreviousThread() || threadStore.close();
        component.handleClickArchive(ev);
    }

    trashCurrentThread = (ev) => {
        const component = this.currentComponent;
        this.selectNextThread() || this.selectPreviousThread() || threadStore.close();
        component.handleClickTrash(ev);
    }

    /* Actual move is executed by the ControlInput component (and react-dnd) */
    setMovingCurrentThread = () => {
        const component = this.currentComponent;
        this.selectNextThread() || this.selectPreviousThread() || threadStore.close();
        component.setIsMoving();
    }

    handleKeyboardEvents = (ev) => {
        const code = ev.keyCode;

        if (this.disabled) {
            if (searchStore.props.open && code === keys.ESCAPE) {
                searchStore.close();
                return;
            }
            return;
        }

        // Code we don't care about?
        if (!_.includes(validKeyCodes, code)) {
            console.debug(`Not handling key code: ${code}`);
            return;
        }

        ev.preventDefault();

        // Control mode
        if (controlStore.props.open) {
            if (code === keys.ESCAPE) {
                controlStore.close();
            }
            return;
        }

        if (code === keys.ESCAPE) {
            threadStore.close();
            return;
        }

        if (code === keys.S) {
            searchStore.open();
            return;
        }

        if (code === keys.Z) {
            requestStore.undo();
            return;
        }

        if (this.currentComponent) {
            const subject = this.currentComponent.props.thread[0].subject;
            const moveData = getMoveDataFromThreadComponent(this.currentComponent);

            switch (code) {
                // Current component: actions needing control input
                case keys.M:
                    controlStore.open('move', subject, moveData);
                    // TODO: MOVE
                    break;
                case keys.C:
                    controlStore.open('copy', subject, moveData);
                    // TODO: COPY
                    break;

                // Current component: immediate actions
                case keys.SPACE:
                    this.openCurrentThread(ev);
                    break;
                case keys.DELETE:
                    this.trashCurrentThread(ev);
                    break;
                case keys.ENTER:
                    this.archiveCurrentThread(ev);
                    break;

                // Jump to other components
                case keys.ARROW_UP:
                    this.selectPreviousThread();
                    break;
                case keys.ARROW_DOWN:
                    this.selectNextThread();
                    break;
                case keys.ARROW_LEFT:
                    this.selectPreviousColumnThread();
                    break;
                case keys.ARROW_RIGHT:
                    this.selectNextColumnThread();
                    break;
            }
        }
    }
}


const keyboard = new Keyboard();
export default keyboard;
