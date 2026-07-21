import _ from "lodash";
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

    const target = this.props.targetElement!.getBoundingClientRect();

    // Render hidden first so we can measure the tooltip's own size, then
    // position from the preferred side, flipping/clamping to stay on screen.
    const onload = (ref: HTMLElement | null) => {
      if (!ref) {
        return;
      }
      const gap = 4;
      const tip = ref.getBoundingClientRect();

      let left: number;
      let top: number;

      if (this.props.position === "left") {
        left = target.left - tip.width - gap;
        top = target.top + (target.height - tip.height) / 2;
        if (left < gap) {
          left = target.right + gap;
        }
      } else if (this.props.position === "right") {
        left = target.right + gap;
        top = target.top + (target.height - tip.height) / 2;
        if (left + tip.width > window.innerWidth - gap) {
          left = target.left - tip.width - gap;
        }
      } else if (this.props.position === "top") {
        left = target.left + (target.width - tip.width) / 2;
        top = target.top - tip.height - gap;
        if (top < gap) {
          top = target.bottom + gap;
        }
      } else {
        // Default: just below the left side of the target
        left = target.left;
        top = target.bottom + gap;
        if (top + tip.height > window.innerHeight - gap) {
          top = target.top - tip.height - gap;
        }
      }

      ref.style.left = _.clamp(left, gap, window.innerWidth - tip.width - gap) + "px";
      ref.style.top = _.clamp(top, gap, window.innerHeight - tip.height - gap) + "px";
      ref.style.visibility = "visible";
    }

    return (
      <div
        className="tooltip"
        style={{ visibility: "hidden" }}
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
