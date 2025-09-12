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
  const textBits = text.split(" ");
  if (textBits.length > 1) {
    return `${textBits[0][0]}${textBits[1][0]}`;
  }

  const capitalOnlyText = text.replace(/[^A-Z]/g, "");
  if (capitalOnlyText.length == 1) {
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

    const state: IAvatarState = {};

    if (settingsStore.props.system.loadContactIcons) {
      const email = props.address ? props.address.email : "";
      if (emailToIconBytesCache[email] !== undefined) {
        state.iconBytes = emailToIconBytesCache[email]!;
      } else {
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
    }

    this.state = state;
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
