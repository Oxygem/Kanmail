import _ from "lodash";
import React from "react";
import ReactDOM from "react-dom";

import keyboard from "../keyboard.ts";
import Icon, { IconName } from "./Icon.tsx";

const EDGE_GAP = 8;
const MENU_GAP = 6;

interface IPopoverMenuProps {
  trigger: React.ReactNode;
  triggerClassName?: string;
  title?: string;
  align?: "left" | "right";
  placement?: "below" | "above";
  children: (close: () => void) => React.ReactNode;
}

interface IPopoverMenuState {
  open: boolean;
}

export default class PopoverMenu extends React.Component<IPopoverMenuProps, IPopoverMenuState> {
  private triggerElement: HTMLButtonElement | null = null;
  private releaseKeyboard: (() => void) | null = null;

  state: IPopoverMenuState = { open: false };

  componentWillUnmount() {
    this.unbindKeyboard();
  }

  open() {
    this.releaseKeyboard = keyboard.suspend("PopoverMenu");
    window.addEventListener("keydown", this.handleKeyDown, true);
    this.setState({ open: true });
  }

  close = () => {
    this.unbindKeyboard();
    this.setState({ open: false });
  };

  // Rendered hidden, then measured and placed on the preferred side of the
  // trigger, flipping to the other side and clamping to stay on screen
  positionMenu = (menu: HTMLDivElement | null) => {
    if (!menu || !this.triggerElement) {
      return;
    }

    const trigger = this.triggerElement.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = menu;
    const below = trigger.bottom + MENU_GAP;
    const above = trigger.top - MENU_GAP - height;
    const fitsBelow = below + height <= window.innerHeight - EDGE_GAP;
    const fitsAbove = above >= EDGE_GAP;

    let top = this.props.placement === "above" ? above : below;
    if (this.props.placement === "above" && !fitsAbove && fitsBelow) {
      top = below;
    } else if (this.props.placement !== "above" && !fitsBelow && fitsAbove) {
      top = above;
    }

    const left = this.props.align === "left" ? trigger.left : trigger.right - width;

    menu.style.top = `${_.clamp(top, EDGE_GAP, window.innerHeight - height - EDGE_GAP)}px`;
    menu.style.left = `${_.clamp(left, EDGE_GAP, window.innerWidth - width - EDGE_GAP)}px`;
    menu.style.visibility = "visible";
  };

  unbindKeyboard() {
    if (this.releaseKeyboard) {
      this.releaseKeyboard();
      this.releaseKeyboard = null;
      window.removeEventListener("keydown", this.handleKeyDown, true);
    }
  }

  handleKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      this.close();
    }
  };

  handleClickTrigger = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (this.state.open) {
      this.close();
    } else {
      this.open();
    }
  };

  renderMenu() {
    return ReactDOM.createPortal(
      <>
        <div className="popover-menu-cover" onClick={this.close} />
        <div
          className="popover-menu"
          ref={this.positionMenu}
          style={{ visibility: "hidden" }}
          onClick={(ev) => ev.stopPropagation()}
        >
          {this.props.children(this.close)}
        </div>
      </>,
      document.body,
    );
  }

  render() {
    return (
      <>
        <button
          type="button"
          ref={(el) => this.triggerElement = el}
          className={`${this.props.triggerClassName || ""}${this.state.open ? " active" : ""}`}
          title={this.props.title}
          onClick={this.handleClickTrigger}
        >
          {this.props.trigger}
        </button>
        {this.state.open && this.renderMenu()}
      </>
    );
  }
}

interface IMenuItemProps {
  icon?: IconName;
  label: React.ReactNode;
  hint?: string;
  active?: boolean;
  onClick: () => void;
  close: () => void;
}

export function MenuItem({ icon, label, hint, active, onClick, close }: IMenuItemProps) {
  return (
    <button
      type="button"
      className={`menu-item${active ? " active" : ""}`}
      onClick={() => {
        close();
        onClick();
      }}
    >
      {icon && <Icon name={icon} size={16} />}
      <span className="menu-label">{label}</span>
      {hint && <kbd>{hint}</kbd>}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="menu-separator" />;
}
