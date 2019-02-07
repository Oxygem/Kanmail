import _ from 'lodash';

import threadStore from 'stores/thread.js';
import requestStore from 'stores/request.js';

const keys = {
    // Letters
    Z: 90,

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


function isInViewport(element) {
    var rect = element.getBoundingClientRect();
    var html = document.documentElement;
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || html.clientHeight) &&
        rect.right <= (window.innerWidth || html.clientWidth)
    );
}


function ensureInView(element, alignToTop) {
    if (!isInViewport(element)) {
        element.scrollIntoView(alignToTop);
    }
}


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

    selectNextThread = () => {
        let nextThread;
        let currentComponent = this.currentComponent;

        while (currentComponent) {
            const nextComponent = currentComponent.props.getNextThread();

            if (!nextComponent || !nextComponent.isBusy()) {
                nextThread = nextComponent;
                break;
            }

            currentComponent = nextComponent;
        }

        if (nextThread) {
            this.setThreadComponent(nextThread);

            if (nextThread.element) {
                ensureInView(nextThread.element, false);
            }

            if (threadStore.isOpen) {
                nextThread.handleClick();
            }

            return true;
        }
    }

    selectPreviousThread = () => {
        let previousThread;
        let currentComponent = this.currentComponent;

        while (currentComponent) {
            const previousComponent = currentComponent.props.getPreviousThread();

            if (!previousComponent || !previousComponent.isBusy()) {
                previousThread = previousComponent;
                break;
            }

            currentComponent = previousComponent;
        }

        if (previousThread) {
            this.setThreadComponent(previousThread);

            if (previousThread.element) {
                ensureInView(previousThread.element, true);
            }

            if (threadStore.isOpen) {
                previousThread.handleClick();
            }

            return true;
        }
    }

    setOtherColumnThread = (column) => {
        const threadRefs = column.threadRefs;
        let wantedThreadRef = this.currentComponent.props.threadRef;

        if (wantedThreadRef >= threadRefs.length) {
            wantedThreadRef = threadRefs.length - 1;
        }

        const thread = threadRefs[wantedThreadRef].getDecoratedComponentInstance();

        if (thread) {
            this.setThreadComponent(thread);
            ensureInView(thread.element, true);

            if (threadStore.isOpen) {
                thread.handleClick();
            }
        }
    }

    handleKeyboardEvents = (ev) => {
        if (this.disabled) {
            return;
        }

        const code = ev.keyCode;

        // Code we don't care about?
        if (!_.includes(validKeyCodes, code)) {
            console.debug(`Not handling key code: ${code}`);
            return;
        }

        ev.preventDefault();

        // Escape
        if (code === keys.ESCAPE) {
            threadStore.close();
            return;
        }

        if (code === keys.Z) {
            requestStore.undo();
            return;
        }

        if (this.currentComponent) {
            // Space -> open
            if (code === keys.SPACE) {
                this.currentComponent.handleClick(ev);
            }

            // Delete -> trash
            else if (code === keys.DELETE) {
                const component = this.currentComponent;
                this.selectNextThread() || this.selectPreviousThread();
                component.handleClickTrash(ev);
            }

            // Enter -> archive
            else if (code === keys.ENTER) {
                const component = this.currentComponent;
                this.selectNextThread() || this.selectPreviousThread();
                component.handleClickArchive(ev);
            }

            // Arrow up -> previous thread
            else if (code === keys.ARROW_UP) {
                this.selectPreviousThread();
            }

            // Arrow down -> next thread
            else if (code === keys.ARROW_DOWN) {
                this.selectNextThread();
            }

            // Arrow left -> previous column
            else if (code == keys.ARROW_LEFT) {
                const component = this.currentComponent;
                const previousColumn = component.props.getPreviousColumn();

                if (previousColumn) {
                    this.setOtherColumnThread(previousColumn);
                }
            }

            // Arrow right -> previous column
            else if (code == keys.ARROW_RIGHT) {
                const component = this.currentComponent;
                const previousColumn = component.props.getNextColumn();

                if (previousColumn) {
                    this.setOtherColumnThread(previousColumn);
                }
            }
        }
    }
}


const keyboard = new Keyboard();
export default keyboard;
