import PropTypes from "prop-types";
import React from "react";

import { subscribe } from "../stores/base.tsx";
import tooltipStore, { ITooltipProps } from "../stores/tooltip.ts";

@subscribe(tooltipStore)
export class TheTooltip extends React.Component<Partial<ITooltipProps>> {
  render(): React.ReactNode {
    if (!this.props.visible) {
      return null;
    }

    const position = this.props.targetElement!.getBoundingClientRect();
    const style: React.CSSProperties = {};

    if (this.props.position === "default") {
      // Default: put the tooltip just below the left side of the target
      style.top = position.bottom + 4;
      style.left = position.left;
    } else {
      // Non-default: hide tooltip so we can calculate pos using it's own w/h before showing
      style.visibility = "hidden";
    }

    const onload = (ref: HTMLElement | null) => {
      if (ref && this.props.position === "left") {
        ref.style.visibility = "visible";
        const pos = ref.getBoundingClientRect();
        ref.style.left = position.left - pos.width - 4 + "px";
        ref.style.top = position.top + (position.height / 2) - (pos.height / 2) + "px";
      }
    }

    return (
      <div
        className="tooltip"
        style={style}
        ref={onload}
      >
        {this.props.text}
      </div>
    );
  }
}

interface TooltipProps {
  children?: React.ReactNode;
  text?: string | any;
  position?: string;
}

export default class Tooltip extends React.Component<TooltipProps> {
  element: Element | null;

  componentWillUnmount() {
    tooltipStore.hide();
  }

  render() {
    return (
      <div
        className="tooltip-wrapper"
        onMouseEnter={() =>
          tooltipStore.show(
            this.props.text,
            this.element!,
            this.props.position || "default",
          )
        }
        onMouseLeave={() => tooltipStore.hide()}
        ref={(div) => (this.element = div)}
      >
        {this.props.children}
      </div>
    );
  }
}
