import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import { ALIAS_FOLDERS } from 'constants.js';
import { makeDragElement } from 'window.js';

import filterStore from 'stores/filters.js';
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
            [filterStore, ['accountName']],
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
        accountName: PropTypes.string,
    }

    handleClickDelete = () => {
        if (this.props.isMainColumn) {
            filterStore.setMainColumn(null);
            return;
        }
        settingsStore.removeColumn(this.props.id);
    }

    handleClickMoveLeft = () => {
        settingsStore.moveColumnLeft(this.props.id);
    }

    handleClickMoveRight = () => {
        settingsStore.moveColumnRight(this.props.id);
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
        const deleteIcon = <i
            className="red red-hover delete fa fa-times"
            onClick={this.handleClickDelete}
        />;

        let moveLeftIcon = null;
        if (
            !this.props.isMainColumn
            && settingsStore.props.columns[0] != this.props.id
        ) {
            moveLeftIcon = (
                <i
                    className="green green-hover fa fa-chevron-left"
                    onClick={this.handleClickMoveLeft}
                ></i>
            );
        }

        let moveRightIcon = null;
        const lastColumn = (  // words cannot describe my dislike of JavaScript
            settingsStore.props.columns[settingsStore.props.columns.length - 1]
        );
        if (
            !this.props.isMainColumn
            && lastColumn != this.props.id
        ) {
            moveRightIcon = (
                <i
                    className="green green-hover fa fa-chevron-right"
                    onClick={this.handleClickMoveRight}
                ></i>
            );
        }

        return (
            <div className="icons">
                <i
                    className="blue blue-hover refresh fa fa-refresh"
                    onClick={this.props.getNewEmails}
                />
                {moveLeftIcon}
                {moveRightIcon}
                {deleteIcon}
            </div>
        );
    }

    renderMeta() {
        const totalAccounts = this.props.accountName ? 1 : _.size(this.props.counts);

        const totalEmails = _.reduce(this.props.counts, (memo, value, accountKey) => {
            if (!this.props.accountName || accountKey === this.props.accountName) {
                memo += value;
            }
            return memo;
        }, 0);

        return (
            <div className="text">
                {totalEmails.toLocaleString()} emails in {totalAccounts}&nbsp;
                {totalAccounts > 1 ? 'accounts': 'account'}
            </div>
        );
    }

    render() {
        return (
            <div className="header" ref={makeDragElement}>
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
