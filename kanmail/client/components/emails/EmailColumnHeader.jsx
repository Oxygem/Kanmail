import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import { ALIAS_FOLDERS } from 'constants.js';

import settingsStore from 'stores/settings.js';
import { subscribe } from 'stores/base.jsx';
import { getColumnMetaStore } from 'stores/columns.js';

import { capitalizeFirstLetter } from 'util/string.js';


export default class EmailColumnHeaderWrapper extends React.Component {
    static propTypes = {
        id: PropTypes.string.isRequired,
    }

    render() {
        const WrappedEmailColumnHeader = subscribe(
            getColumnMetaStore(this.props.id),
        )(EmailColumnHeader);

        return <WrappedEmailColumnHeader
            {...this.props}
            {...this.state}
        />;
    }
}


class EmailColumnHeader extends React.Component {
    static propTypes = {
        id: PropTypes.string.isRequired,
        counts: PropTypes.object.isRequired,
        isLoading: PropTypes.bool.isRequired,
        isSyncing: PropTypes.bool.isRequired,
        isMainColumn: PropTypes.bool.isRequired,
        getNewEmails: PropTypes.func.isRequired,
    }

    handleClickDelete = () => {
        settingsStore.removeColumn(this.props.id);
    }

    renderName() {
        const column = this.props.id;

        // If we're an alias folder - capitalize it
        return (
            _.includes(ALIAS_FOLDERS, column) ?
            capitalizeFirstLetter(column) : column
        );
    }

    renderLoadingIcon() {
        if (!this.props.isLoading && !this.props.isSyncing) return;

        return <i className="loading fa fa-refresh fa-spin"></i>;
    }

    renderMetaIcons() {
        const deleteIcon = this.props.isMainColumn ? null : <i
            className="red red-hover fa fa-times"
            onClick={this.handleClickDelete}
        />;

        return (
            <div className="icons">
                <i
                    className="blue blue-hover refresh fa fa-refresh"
                    onClick={this.props.getNewEmails}
                />
                {deleteIcon}
            </div>
        );
    }

    renderMeta() {
        const totalAccounts = _.size(this.props.counts);

        const totalEmails = _.reduce(this.props.counts, (memo, value) => {
            memo += value;
            return memo;
        }, 0);

        return (
            <div className="text">
                {totalEmails.toLocaleString()} emails / {totalAccounts} accounts
            </div>
        );
    }

    render() {
        return (
            <div className="header">
                <h3>
                    {this.renderName()}
                    {this.renderLoadingIcon()}

                    <span className="meta">
                        {this.renderMeta()}
                        {this.renderMetaIcons()}
                    </span>
                </h3>
            </div>
        );
    }
}
