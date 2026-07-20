import React from "react";

import { AppService, EmailsService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { BodyPart } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import requestStore from "../../stores/request.ts";
import settingsStore from "../../stores/settings.ts";
import { IThreadMessage } from "../../stores/thread.ts";
import { formatBytes } from "../../util/string.js";

interface IThreadMessageAttachmentProps {
  partId: string;
  part: BodyPart;
  message: IThreadMessage;
}

interface IThreadMessageAttachmentState {
  downloading: boolean;
  downloaded: boolean;
  downloadError: string | null;
  downloadedFilename: string | null;

}
export default class ThreadMessageAttachment extends React.Component<
  IThreadMessageAttachmentProps,
  IThreadMessageAttachmentState
> {
  constructor(props) {
    super(props);

    this.state = {
      downloading: false,
      downloaded: false,
      downloadError: null,
      downloadedFilename: null,
    };
  }

  handleClick = () => {
    if (this.state.downloaded) {
      AppService.OpenLink(this.state.downloadedFilename!);
      return;
    }

    const { part, partId } = this.props;
    const { accountName, folderName, uid } = this.props.message;

    this.setState({
      downloading: true,
      downloaded: false, // reset if re-downloading
    });

    requestStore.doFetchRequest(
      `Fetch message part in ${accountName}/${folderName}: ${uid}/${part}`,
      EmailsService.DownloadAccountFolderEmailPartData(accountName, folderName, uid, part),
    ).then((filename: string) => (this.setState({
      downloading: false,
      downloaded: filename != "",
      downloadedFilename: filename || null,
    }))).catch((ev) => {
      this.setState({
        downloading: false,
        downloaded: false,
        downloadError: ev?.message ?? String(ev),
      });
      requestStore.addError("Failed to download attachment", ev, { silent: true });
    });
  };

  renderName() {
    const { part } = this.props;
    const name = part.description;

    let nameOrIcon: string | React.JSX.Element = name;
    let topMeta: string | React.JSX.Element = part.type;
    let bottomMeta: string | React.JSX.Element = formatBytes(part.size);

    if (this.state.downloaded) {
      nameOrIcon = "File saved, click to open";
      topMeta = part.type + ", " + formatBytes(part.size);
      bottomMeta = this.state.downloadedFilename!;
    } else if (this.state.downloading) {
      nameOrIcon = <i className="fa fa-cog fa-spin"></i>;
      topMeta = "Downloading...";
      bottomMeta = <span>&nbsp;</span>;
    } else if (this.state.downloadError) {
      nameOrIcon = "Error downloading, click to retry";
      topMeta = this.state.downloadError;
      bottomMeta = <span>&nbsp;</span>;
    }

    return (
      <div className="attach-detail">
        <div className="nm">{nameOrIcon}</div>
        <div className="mt">
          {topMeta}
          {bottomMeta && bottomMeta !== "" ? <> · {bottomMeta}</> : null}
        </div>
      </div>
    );
  }

  render() {
    if (!this.props.part.description && !settingsStore.props.system.showHiddenAttachments) {
      return null;
    }

    return (
      <div
        key={this.props.partId}
        className="attach attachment-link"
        onClick={this.handleClick}
      >
        <span className="ic"><i className="fa fa-paperclip"></i></span>
        {this.renderName()}
      </div>
    );
  }
}
