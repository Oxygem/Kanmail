import _ from "lodash";
import React from "react";

import { Flag } from "../../../bindings/github.com/emersion/go-imap/v2/index.ts";
import Tooltip from "../../components/Tooltip.tsx";
import QuickReply from "../../components/emails/QuickReply.tsx";
import ThreadMessage from "../../components/emails/ThreadMessage.jsx";
import { subscribe } from "../../stores/base.tsx";
import threadStore, { IThreadStoreProps } from "../../stores/thread.ts";

interface IThreadProps extends IThreadStoreProps {
}

interface IThreadState {
  showAllMessages: boolean;
}

class Thread extends React.Component<Partial<IThreadProps>, IThreadState> {
  constructor(props) {
    super(props);

    this.state = {
      showAllMessages: false,
    };
  }

  handleClickClose() {
    threadStore.close();
  }

  // handleClickReply = () => {
  //   const latestMessage = this.getLatestMessage();
  //   openReplyToMessageWindow(latestMessage, {});
  // };

  // handleClickReplyAll = () => {
  //   const latestMessage = this.getLatestMessage();
  //   openReplyToMessageWindow(latestMessage, { reply_all: true });
  // };

  // getLatestMessage() {
  //   if (this.props.messages) {
  //     return this.props.messages[this.props.messages.length - 1];
  //   }
  // }

  showAllMessages = () => {
    this.setState({
      showAllMessages: true,
    });
  };

  renderTitle() {
    let { thread } = this.props;

    if (!thread || thread.length === 0) {
      return <h1>Unknown thread</h1>;
    }

    const latestEmail = thread[0];

    const uniqueSubjects = _.uniq(_.map(thread, (message) => message.subject));
    const subject = thread.mergedThreads
      ? uniqueSubjects.join(", ")
      : latestEmail.subject;

    return (
      <h1>
        {thread.mergedThreads && (
          <Tooltip text={`${thread.mergedThreads} merged threads`}>
            <span className="multi-subject tooltip-wrapper">
              x{thread.mergedThreads}
            </span>
          </Tooltip>
        )}
        {subject}
      </h1>
    );
  }

  renderContent() {
    let { messages, fetching } = this.props;
    messages = messages!;

    if (fetching) {
      return (
        <div className="loader">
          <i className="fa fa-spin fa-refresh"></i>
        </div>
      );
    }

    return _.map(messages, (message, i) => {
      const unread = !_.includes(message.flags, Flag.FlagSeen);
      const isLast = i == messages.length - 1;

      return (
        <ThreadMessage
          key={message.messageId}
          message={message}
          scrollToOnLoad={isLast}
          open={unread || isLast}
        />
      );
    });
  }

  renderQuickReply() {
    const { messages, fetching } = this.props;
    if (fetching || !messages || messages.length === 0) {
      return null;
    }
    const latestMessage = messages[messages.length - 1];
    const isDraft = _.includes(_.keys(latestMessage.folderUids), "drafts");
    if (isDraft) {
      return null;
    }
    return <QuickReply latestMessage={latestMessage} />;
  }

  render() {
    if (!this.props.messages) {
      return null;
    }

    return (
      <section id="threadarea">
        <section
          id="thread-background"
          onClick={this.handleClickClose}
        ></section>
        <section
          id="thread"
          onClick={(ev) => ev.stopPropagation()}
        >
          {this.renderTitle()}
          <section id="content">
            {this.renderContent()}
            {this.renderQuickReply()}
          </section>
        </section>
      </section>
    );
  }
}

// Wrap Thread and re-generate it when the messages we're showing change/vanish
@subscribe(threadStore)
export default class ThreadWrapper extends React.Component<Partial<IThreadProps>> {
  render() {
    return <Thread {...this.props} />;
  }
}
