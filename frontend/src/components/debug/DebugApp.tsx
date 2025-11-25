import React from "react";

import { EmailsService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import keyboard from "../../keyboard.ts";

interface DebugAppState {
  accountName: string;
  folderName: string;
  uid: string;
  loading: boolean;
  error: string | null;
  emailData: any | null;
  contentData: any | null;
}

export default class DebugApp extends React.Component<{}, DebugAppState> {
  constructor(props: {
    accountName?: string,
    folderName?: string,
    uid?: string,
  }) {
    super(props);
    keyboard.disable();

    this.state = {
      accountName: props.accountName || "",
      folderName: props.folderName || "",
      uid: props.uid || "",

      loading: false,
      error: null,
      emailData: null,
      contentData: null,
    };

    if (props.accountName !== "" && props.folderName !== "" && props.uid !== "") {
      this.loadData();
    }
  }

  handleInputChange = (field: keyof Pick<DebugAppState, "accountName" | "folderName" | "uid">) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    this.setState({ [field]: e.target.value } as any);
  };

  loadData = async () => {
    const { accountName, folderName, uid } = this.state;

    if (!accountName || !folderName || !uid) {
      this.setState({ error: "All fields are required" });
      return;
    }

    const uidNum = parseInt(uid, 10);
    if (isNaN(uidNum)) {
      this.setState({ error: "UID must be a valid number" });
      return;
    }

    this.setState({ loading: true, error: null, emailData: null, contentData: null });

    try {
      const [email, content] = await EmailsService.GetAccountFolderEmailAndContent(
        accountName,
        folderName,
        uidNum
      );

      this.setState({
        loading: false,
        emailData: email,
        contentData: content,
      });
    } catch (err: any) {
      this.setState({
        loading: false,
        error: err?.message || "Failed to fetch email",
      });
    }
  }

  handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await this.loadData();
  };

  render() {
    const { accountName, folderName, uid, loading, error, emailData, contentData } = this.state;

    return (
      <section className="no-select">
        <section id="debug">
          <header className="new-email flex header-bar">
            Kanmail Debugger
          </header>

          <form onSubmit={this.handleSubmit} style={{ marginBottom: "20px" }}>
            <div style={{ marginBottom: "10px" }}>
              <label style={{ display: "block", marginBottom: "5px" }}>
                Account Name:
              </label>
              <input
                type="text"
                value={accountName}
                onChange={this.handleInputChange("accountName")}
                placeholder="e.g., main@example.com"
                style={{ width: "100%", padding: "5px" }}
              />
            </div>

            <div style={{ marginBottom: "10px" }}>
              <label style={{ display: "block", marginBottom: "5px" }}>
                Folder Name:
              </label>
              <input
                type="text"
                value={folderName}
                onChange={this.handleInputChange("folderName")}
                placeholder="e.g., INBOX"
                style={{ width: "100%", padding: "5px" }}
              />
            </div>

            <div style={{ marginBottom: "10px" }}>
              <label style={{ display: "block", marginBottom: "5px" }}>
                UID:
              </label>
              <input
                type="text"
                value={uid}
                onChange={this.handleInputChange("uid")}
                placeholder="e.g., 12345"
                style={{ width: "100%", padding: "5px" }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ padding: "10px 20px", cursor: loading ? "wait" : "pointer" }}
            >
              {loading ? "Fetching..." : "Fetch Email"}
            </button>
          </form>

          {error && (
            <div style={{ padding: "10px", backgroundColor: "#ffebee", color: "#c62828", marginBottom: "20px" }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          {emailData && (
            <div style={{ marginBottom: "20px" }}>
              <h3>Email Data:</h3>
              <pre style={{
                backgroundColor: "#f5f5f5",
                padding: "15px",
                overflow: "auto",
                maxHeight: "400px",
                fontSize: "12px",
                border: "1px solid #ccc",
              }}>
                {JSON.stringify(emailData, null, 2)}
              </pre>
            </div>
          )}

          {contentData && (
            <div style={{ marginBottom: "20px" }}>
              <h3>Content Data:</h3>
              <pre style={{
                backgroundColor: "#f5f5f5",
                padding: "15px",
                overflow: "auto",
                maxHeight: "400px",
                fontSize: "12px",
                border: "1px solid #ccc",
              }}>
                {JSON.stringify(contentData, null, 2)}
              </pre>
            </div>
          )}
        </section>
      </section>
    );
  }
}
