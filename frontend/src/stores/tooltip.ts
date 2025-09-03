import { BaseStore } from "./base.tsx";

export interface ITooltipProps {
  visible: boolean;
  text: string | null;
  targetElement: Element | null;
  position: string;
}

function makeDefaults(): ITooltipProps {
  return {
    visible: false,
    text: null,
    targetElement: null,
    position: "default",
  };
}

class TooltipStore extends BaseStore {
  static storeKey = "tooltipStore";

  props: ITooltipProps;

  constructor() {
    super();
    this.props = makeDefaults();
  }

  show(text: string, targetElement: Element, position: string) {
    this.props.visible = true;
    this.props.text = text;
    this.props.targetElement = targetElement;
    this.props.position = position;
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
