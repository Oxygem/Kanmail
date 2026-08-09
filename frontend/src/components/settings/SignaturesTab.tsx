import _ from "lodash";
import React from "react";

import { AccountSettings, Address } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { subscribe } from "../../stores/base.tsx";
import settingsStore from "../../stores/settings.ts";
import systemStore from "../../stores/system.ts";
import { sanitizeHtml } from "../../util/html.ts";
import Avatar from "../Avatar.jsx";
import { openPurchasePage } from "../LicensePurchase.tsx";
import EditorToolButtons from "../send/EditorToolButtons.tsx";
import SquireEditor, {
  SquireEditorApi,
  SquireFormatStates,
  defaultFormatStates,
} from "../send/SquireEditor.tsx";

const SAVE_DEBOUNCE_MS = 500;

interface ISignatureEditorProps {
  account: AccountSettings;
  accountIndex: number;
  onSave: (accountIndex: number, signature: string) => void;
}

interface ISignatureEditorState {
  formatStates: SquireFormatStates;
}

class SignatureEditor extends React.Component<ISignatureEditorProps, ISignatureEditorState> {
  private editorApi: SquireEditorApi | null = null;
  private hasSeeded = false;

  // Debounced so typing doesn't rewrite settings.json on every keystroke
  private save = _.debounce(
    (signature: string) => this.props.onSave(this.props.accountIndex, signature),
    SAVE_DEBOUNCE_MS,
  );

  constructor(props: ISignatureEditorProps) {
    super(props);
    this.state = { formatStates: defaultFormatStates };
  }

  handleUpdate = (signature: string) => {
    // The editor emits once on mount to report its normalised content - that's
    // not a user edit, and saving it would rewrite settings just for opening
    // this tab
    if (!this.hasSeeded) {
      this.hasSeeded = true;
      return;
    }
    this.save(signature);
  };

  componentWillUnmount() {
    // Switching settings tabs or closing the window unmounts us mid-edit
    this.save.flush();
  }

  render() {
    return (
      <>
        <SquireEditor
          initialContent={this.props.account.settings.signature || ""}
          onReady={(api) => { this.editorApi = api; }}
          onFormatStateChange={(formatStates) => this.setState({ formatStates })}
          onUpdate={this.handleUpdate}
        />
        <div className="sig-actions">
          <EditorToolButtons
            formatStates={this.state.formatStates}
            onCommand={(command, value) => this.editorApi?.command(command, value)}
          />
        </div>
      </>
    );
  }
}

interface ISignaturesTabProps {
  accounts: AccountSettings[];
  updateAccountSignature: (accountIndex: number, signature: string) => void;
  // Injected by the store subscription below
  isLicensed?: boolean;
}

@subscribe(systemStore)
class SignaturesTab extends React.Component<ISignaturesTabProps> {
  renderAccount(account: AccountSettings, accountIndex: number) {
    const signature = account.settings.signature || "";

    return (
      <div className="sig-card" key={account.id || accountIndex}>
        <div className="acct-row">
          <Avatar
            border={settingsStore.getAccountAccentColor(account.id)}
            address={(account.contacts && account.contacts.length > 0)
              ? account.contacts[0]
              : new Address({ email: account.imapSettings.username })
            }
          />
          <div className="grow">
            <div className="nm">{account.name}</div>
            <div className="em">{account.imapSettings.username}</div>
          </div>
        </div>
        {this.props.isLicensed
          ? <SignatureEditor
            key={account.id || accountIndex}
            account={account}
            accountIndex={accountIndex}
            onSave={this.props.updateAccountSignature}
          />
          : <div className="squire-editor-container disabled">
            <div
              className="squire-editor"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(signature) }}
            />
          </div>}
      </div>
    );
  }

  render() {
    const { isLicensed } = this.props;

    return (
      <div className="km-signatures">
        {!isLicensed && <>
          <div className="license-col sig-upsell">
            <h3 className="sub">Managing signatures requires a Kanmail license.</h3>
            <p className="help-text">
              Signatures are still added when composing emails, a license lets
              you customize or remove it.
            </p>
            <button type="button" className="btn-primary" onClick={openPurchasePage}>
              Buy your license →
            </button>
          </div>
          <div className="col-divider" />
        </>}
        <div className="sig-list">
          <p className="help-text">
            Added to the bottom of new messages, above any quoted reply. Each
            account gets its own.
          </p>
          {this.props.accounts.map((account, i) => this.renderAccount(account, i))}
        </div>
      </div>
    );
  }
}

export default SignaturesTab;
