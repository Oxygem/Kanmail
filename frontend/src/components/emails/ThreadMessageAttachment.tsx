import React from "react";

import { AppService, EmailsService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { BodyPart } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import requestStore from "../../stores/request.ts";
import { IThreadMessage } from "../../stores/thread.ts";
import { formatBytes } from "../../util/string.js";
import Icon from "../Icon.tsx";

const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

export function isImageAttachment(part: BodyPart): boolean {
  return part.type.startsWith("image/");
}

function attachmentTypeLabel(part: BodyPart): string {
  const extension = part.description.includes(".") ? part.description.split(".").pop() : "";
  const subtype = part.type.split("/")[1] || "";
  const label = extension || subtype.replace(/^(x-|vnd\.)/, "");
  return label.toUpperCase();
}

interface IThreadMessageAttachmentProps {
  part: BodyPart;
  message: IThreadMessage;
}

interface IThreadMessageAttachmentState {
  downloading: boolean;
  downloadError: string | null;
  downloadedFilename: string | null;
  thumbnail: string | null;
}

export default class ThreadMessageAttachment extends React.Component<
  IThreadMessageAttachmentProps,
  IThreadMessageAttachmentState
> {
  private mounted = false;

  state: IThreadMessageAttachmentState = {
    downloading: false,
    downloadError: null,
    downloadedFilename: null,
    thumbnail: null,
  };

  componentDidMount() {
    this.mounted = true;
    this.fetchThumbnail();
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  fetchThumbnail() {
    const { part, message } = this.props;
    if (!isImageAttachment(part) || part.size > MAX_THUMBNAIL_BYTES || !message.uid) {
      return;
    }

    EmailsService.GetAccountFolderEmailsContentParts(message.accountID, message.folderName, {
      [message.uid]: part,
    }).then(resp => {
      const data = resp[message.uid]?.data;
      if (data && this.mounted) {
        this.setState({ thumbnail: `data:${part.type};base64,${data}` });
      }
    }).catch(e => {
      console.debug("Failed to load attachment thumbnail", part.description, e);
    });
  }

  handleClick = () => {
    if (this.state.downloadedFilename) {
      AppService.OpenFile(this.state.downloadedFilename).catch((ev) => {
        requestStore.addError("Failed to open attachment", ev, { silent: true });
      });
      return;
    }

    const { part } = this.props;
    const { accountID, folderName, uid } = this.props.message;

    this.setState({ downloading: true, downloadError: null });

    requestStore.doFetchRequest(
      `Fetch message part in ${accountID}/${folderName}: ${uid}/${part}`,
      EmailsService.DownloadAccountFolderEmailPartData(accountID, folderName, uid, part),
    ).then((filename: string) => this.setState({
      downloading: false,
      downloadedFilename: filename || null,
    })).catch((ev) => {
      this.setState({
        downloading: false,
        downloadError: ev?.message ?? String(ev),
      });
      requestStore.addError("Failed to download attachment", ev, { silent: true });
    });
  };

  renderStatus() {
    const { part } = this.props;

    if (this.state.downloading) {
      return "Downloading…";
    } else if (this.state.downloadError) {
      return "Failed, click to retry";
    } else if (this.state.downloadedFilename) {
      return "Saved, click to open";
    }
    return `${attachmentTypeLabel(part)} · ${formatBytes(part.size, 0)}`;
  }

  renderImage() {
    const { part } = this.props;

    return (
      <button
        type="button"
        className="attach-image"
        title={part.description}
        onClick={this.handleClick}
      >
        <span className="thumb">
          {this.state.thumbnail
            ? <img src={this.state.thumbnail} alt="" />
            : <Icon name="image" size={22} />}
          {this.state.downloading && <span className="thumb-busy"><Icon name="loader" className="spin" /></span>}
        </span>
        <span className="nm">{part.description}</span>
        {(this.state.downloadError || this.state.downloadedFilename) && (
          <span className="mt">{this.renderStatus()}</span>
        )}
      </button>
    );
  }

  renderFile() {
    const { part } = this.props;

    return (
      <button
        type="button"
        className="attach-file"
        title={this.state.downloadedFilename || part.description}
        onClick={this.handleClick}
      >
        <span className="ic">
          <Icon name={this.state.downloading ? "loader" : "file"} size={16} className={this.state.downloading ? "spin" : ""} />
        </span>
        <span className="attach-detail">
          <span className="nm">{part.description || part.type}</span>
          <span className="mt">{this.renderStatus()}</span>
        </span>
      </button>
    );
  }

  render() {
    return isImageAttachment(this.props.part) ? this.renderImage() : this.renderFile();
  }
}
