import { BaseStore } from 'stores/base.jsx';


function makeDefaults() {
    return {
        open: false,
        inputHandler: null,
        extraProps: {},
    };
}


class ControlStore extends BaseStore {
    /*
        Global store of the users app settings.
    */

    static storeKey = 'controlStore';

    constructor() {
        super();

        this.props = makeDefaults();
    }

    open = (inputHandler, extraProps={}) => {
        this.props = {
            open: true,
            inputHandler: inputHandler,
            extraProps: extraProps,
        };
        this.triggerUpdate();
    }

    close = (triggerInputHandler=true) => {
        if (this.props.open) {
            if (triggerInputHandler) {
                this.props.inputHandler(null);
            }
            this.props = makeDefaults();
            this.triggerUpdate();
        }
    }
}


const controlStore = new ControlStore();
export default controlStore;
