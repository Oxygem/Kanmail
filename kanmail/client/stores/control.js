import { BaseStore } from 'stores/base.jsx';


function makeDefaults() {
    return {
        open: false,
        action: null,
        subject: null,
        moveData: null,
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

    open = (action, subject, moveData) => {
        this.props.open = true;
        this.props.action = action;
        this.props.subject = subject;
        this.props.moveData = moveData;
        this.triggerUpdate();
    }

    close = () => {
        if (this.props.open) {
            this.props = makeDefaults();
            this.triggerUpdate();
        }
    }
}


const controlStore = new ControlStore();
export default controlStore;
