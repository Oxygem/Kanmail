import { BaseStore } from 'stores/base.jsx';


function makeDefaults() {
    return {
        visible: false,
        text: null,
        targetElement: null,
    };
}


class TooltipStore extends BaseStore {
    static storeKey = 'tooltipStore';

    constructor() {
        super();
        this.props = makeDefaults();
    }

    show(text, targetElement) {
        this.props.visible = true;
        this.props.text = text;
        this.props.targetElement = targetElement;
        this.triggerUpdate();
    }

    hide() {
        if (!this.props.visible) {
            return;
        }

        this.props = makeDefaults();
        this.triggerUpdate();
    }
}


const tooltipStore = new TooltipStore();
export default tooltipStore;
