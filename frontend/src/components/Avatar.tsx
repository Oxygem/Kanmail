import randomColor from "randomcolor";
import React from "react";

import { AvatarResp } from "../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { Address } from "../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import contactsStore from "../stores/contacts.ts";
import settingsStore from "../stores/settings.ts";

const emailToColorCache = {};
const emailToIconBytesCache: { [_: string]: string | null } = {};

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
}

interface IAvatarState {
  iconBytes?: string;
  iconContentType?: string;
}

export default class Avatar extends React.Component<IAvatarProps, IAvatarState> {
  constructor(props: IAvatarProps) {
    super(props);
    this.state = {
      iconBytes: this.getCachedIcon(),
    };
  }

  getCachedIcon = (): string | undefined => {
    const email = this.props.address ? this.props.address.email : "";
    if (emailToIconBytesCache[email] !== undefined) {
      return emailToIconBytesCache[email]!;
    }
  }

  getIcon = (): string | undefined => {
    if (!settingsStore.props.system.loadContactIcons) {
      return;
    }

    const icon = this.getCachedIcon();
    if (icon !== undefined) {
      this.setState({ iconBytes: icon });
      return;
    }

    const email = this.props.address ? this.props.address.email : "";
    contactsStore.getAvatar(email).then((resp: AvatarResp) => {
      if (!resp) {
        emailToIconBytesCache[email] = null
        console.log("No avatar found", email)
        return
      }
      this.setState({ iconBytes: resp.data! })
      emailToIconBytesCache[email] = resp.data!;
      console.log("Loaded avatar", email);
    })
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
        <img src={`data:${this.state.iconContentType};base64,${this.state.iconBytes}`} onLoad={this.checkIcon} />
      </div>;
    }

    return (
      <div
        className="avatar"
        style={{ background: getColorForAddress(address) }}
      >
        {<span>{getInitialsFromAddress(address)}</span>}
      </div>
    );
  }
}
