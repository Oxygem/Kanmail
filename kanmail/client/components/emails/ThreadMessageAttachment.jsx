import React from 'react';
import PropTypes from 'prop-types';

import { openFile } from 'window.js';

import requestStore from 'stores/request.js';
import { formatBytes, encodeFolderName } from 'util/string.js';


export default class ThreadMessageAttachment extends React.Component {
    static propTypes = {
        partId: PropTypes.string.isRequired,
        part: PropTypes.object.isRequired,
        message: PropTypes.object.isRequired,
    }

    constructor(props) {
        super(props);

        this.state = {
            downloading: false,
            downloaded: false,
            downloadedFilename: null,
        };
    }

    handleClick = () => {
        if (this.state.downloaded) {
            openFile(this.state.downloadedFilename);
            return;
        }

        const { part, partId } = this.props;
        const { account_name, folder_name, uid } = this.props.message;

        this.setState({
            downloading: true,
            downloaded: false, // reset if re-downloading
        });

        requestStore.get(
            `Fetch message part in ${account_name}/${folder_name}: ${uid}/${partId}`,
            `/api/emails/${account_name}/${encodeFolderName(folder_name)}/${uid}/${partId}/download`,
            {filename: part.name || 'unknown'},
        ).then(data => {
            if (data.saved) {
                this.setState({
                    downloading: false,
                    downloaded: true,
                    downloadedFilename: data.filename,
                });
            } else {
                this.setState({
                    downloading: false,
                    downloaded: false,
                    downloadedFilename: null,
                });
            }
        });
    }

    renderName() {
        const { part } = this.props;
        const name = part.name || 'unknown';

        let nameOrIcon = name;
        let topMeta = `${part.type}/${part.subtype}`;
        let bottomMeta = formatBytes(part.size);

        if (this.state.downloaded) {
            nameOrIcon = <i className="fa fa-tick"></i>;
            topMeta = 'File saved to';
            bottomMeta = this.state.downloadedFilename;
        } else if (this.state.downloading) {
            nameOrIcon = <i className="fa fa-cog fa-spin"></i>;
            topMeta = 'Downloading...';
        }

        return (
            <div>
                {nameOrIcon}
                <span className="attachment-meta">
                    {topMeta}<br />
                    {bottomMeta}
                </span>
            </div>
        );
    }

    render() {
        return (
            <div
                key={this.props.partId}
                className="attachment-link"
                onClick={this.handleClick}
            >
                {this.renderName()}
            </div>
        );
    }
}
