import randomColor from "randomcolor";
import React from "react";

import { AvatarResp } from "../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { Address } from "../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import contactsStore from "../stores/contacts.ts";
import settingsStore from "../stores/settings.ts";

const emailToColorCache = {};
const emailToIconCache: {
  [_: string]: { data: string; contentType: string } | null;
} = {};

function getColorForAddress(address) {
  if (!address) {
    return randomColor();
  }
  const email = address.email;
  if (!emailToColorCache[email]) {
    emailToColorCache[email] = randomColor();
  }
  return emailToColorCache[email];
}

function getInitialsFromAddress(address) {
  if (!address) {
    return "";
  }
  const text = address.name || address.email;
  if (text.length === 0) {
    return "";
  }
  const textBits = text.split(" ");
  if (textBits.length > 1) {
    return `${textBits[0][0]}${textBits[1][0]}`;
  }

  const capitalOnlyText = text.replace(/[^A-Z]/g, "");
  if (capitalOnlyText.length === 1) {
    return capitalOnlyText;
  } else if (capitalOnlyText.length > 1) {
    return `${capitalOnlyText[0]}`;
  }

  return text[0][0];
}

interface IAvatarProps {
  address: Address;
  border?: string;
}

interface IAvatarState {
  iconBytes?: string;
  iconContentType?: string;
}

export default class Avatar extends React.Component<IAvatarProps, IAvatarState> {
  constructor(props: IAvatarProps) {
    super(props);
    const cached = this.getCachedIcon();
    this.state = {
      iconBytes: cached?.data,
      iconContentType: cached?.contentType,
    };
  }

  // undefined = not looked up yet, null = known to have no avatar
  getCachedIcon = (): { data: string; contentType: string } | null | undefined => {
    const email = this.props.address ? this.props.address.email : "";
    return emailToIconCache[email];
  }

  getIcon = (): void => {
    if (!settingsStore.props.system.loadContactIcons) {
      return;
    }

    const cached = this.getCachedIcon();
    if (cached !== undefined) {
      // Always set (undefined for a known no-avatar) - the address prop may
      // have changed and a previous sender's icon must not linger
      this.setState({ iconBytes: cached?.data, iconContentType: cached?.contentType });
      return;
    }

    const email = this.props.address ? this.props.address.email : "";
    contactsStore.getAvatar(email).then((resp: AvatarResp) => {
      if (!resp || !resp.data) {
        emailToIconCache[email] = null;
        this.setState({ iconBytes: undefined, iconContentType: undefined });
        return;
      }
      const icon = { data: resp.data, contentType: resp.contentType };
      emailToIconCache[email] = icon;
      this.setState({ iconBytes: icon.data, iconContentType: icon.contentType });
    }).catch((e) => {
      console.debug("Failed to load avatar", email, e);
    })
  }

  getBorder = (): string | undefined => {
    if (!this.props.border) {
      return;
    }
    return `2px solid ${this.props.border}`;
  }

  componentDidMount() {
    if (!this.state.iconBytes) {
      this.getIcon();
    }
  }

  componentDidUpdate(prevProps: IAvatarProps) {
    if (
      prevProps.address.email === this.props.address.email
      && prevProps.address.name === this.props.address.name) {
      return;
    }
    this.getIcon();
  }

  checkIcon = (ev) => {
    //   if (ev.target.naturalHeight === 1) {
    //     this.setState({ hasIcon: false });
    //   }
  };

  render() {
    const { address } = this.props;

    if (this.state.iconBytes) {
      return <div className="avatar">
        <img
          src={`data:${this.state.iconContentType || "image/png"};base64,${this.state.iconBytes}`}
          onLoad={this.checkIcon}
          style={{ border: this.getBorder() }}
        />
      </div>;
    }

    return (
      <div
        className="avatar"
        style={{ background: getColorForAddress(address), border: this.getBorder() }}
      >
        {<span>{getInitialsFromAddress(address).toUpperCase()}</span>}
      </div>
    );
  }
}
