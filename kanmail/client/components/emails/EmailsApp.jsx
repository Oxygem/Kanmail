import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';
import { DragDropContext } from 'react-dnd';
import HTML5Backend from 'react-dnd-html5-backend';

import keyboard from 'keyboard.js';
import createWindowPositionHandlers from 'window.js';
import { ALWAYS_SYNC_FOLDERS, CHECK_NEW_EMAIL_INTERVAL } from 'constants.js';

import Thread from 'components/emails/Thread.jsx';
import Search from 'components/emails/Search.jsx';
import Sidebar from 'components/emails/Sidebar.jsx';
import EmailColumn from 'components/emails/EmailColumn.jsx';
import MainColumn from 'components/emails/MainColumn.jsx';
import AddNewColumnForm from 'components/emails/AddNewColumnForm.jsx';

import mainEmailStore from 'emails/main.js';

import settingsStore from 'stores/settings.js';
import { getColumnStore } from 'stores/columns.js';
import { subscribe } from 'stores/base.jsx';


@subscribe(settingsStore)
@DragDropContext(HTML5Backend)
export default class EmailsApp extends React.Component {
    static propTypes = {
        columns: PropTypes.array.isRequired,
        accounts: PropTypes.object.isRequired,
        settingsFile: PropTypes.string.isRequired,
        systemSettings: PropTypes.object.isRequired,
        folderNames: PropTypes.array,
    }

    componentDidMount() {
        // Enable keyboard controls
        keyboard.enable();
        // Create resize/move window position saver handlers
        createWindowPositionHandlers();

        const { initial_batches, batch_size } = this.props.systemSettings;
        const initialBatchSize = batch_size * initial_batches;

        // Load all the alias folders (ie the main column)
        _.each(ALWAYS_SYNC_FOLDERS, folder => {
            // Call this to ensure the column store is populated
            getColumnStore(folder);

            mainEmailStore.getFolderEmails(
                folder,
                {query: {
                    reset: true,
                    batch_size: initialBatchSize,
                }},
            ).then(mainEmailStore.syncFolderEmails(folder));
        });

        this.newAliasEmailCheck = setTimeout(
            this.getNewAliasFolderEmails,
            CHECK_NEW_EMAIL_INTERVAL,
        );
    }

    componentWillUnmount() {
        clearTimeout(this.newAliasEmailCheck);
    }

    getNewAliasFolderEmails = () => {
        const requests = _.map(
            ALWAYS_SYNC_FOLDERS,
            folder => mainEmailStore.syncFolderEmails(folder),
        );

        Promise.all(requests).then(() => {
            this.newAliasEmailCheck = setTimeout(
                this.getNewAliasFolderEmails,
                CHECK_NEW_EMAIL_INTERVAL,
            );
        });
    }

    renderEmailColumn(column) {
        return <EmailColumn
            key={column}
            id={column}
            name={column}
        />;
    }

    renderColumns() {
        const columnElements = [];
        const columnRefs = [];

        const getColumn = (id) => {
            const column = columnRefs[id];

            if (column) {
                // Email columns are wrapped dynamically with their store so
                // fetch the underlying column.
                return column.getDecoratedComponentInstance();
            }
        }

        const pushMainColumnRef = (ref) => {
            if (!ref) {
                return;
            }

            columnRefs[0] = ref
                .wrappedComponent
                .getDecoratedComponentInstance();
        }

        columnElements.push(<MainColumn
            key="main"
            getNextColumn={() => getColumn(1)}
            getPreviousColumn={() => getColumn(-1)}
            columnsCount={this.props.columns.length}
            ref={pushMainColumnRef}
        />);

        _.each(this.props.columns, (columnName, i) => {
            // Bump for the main column
            i += 1;

            const getPreviousColumn = () => getColumn(i - 1);
            const getNextColumn = () => getColumn(i + 1);

            columnElements.push(<EmailColumn
                key={columnName}
                id={columnName}
                name={columnName}
                getPreviousColumn={getPreviousColumn}
                getNextColumn={getNextColumn}
                ref={ref => columnRefs[i] = ref}
            />);
        });

        return columnElements;
    }

    renderColumnsSection() {
        if (_.isEmpty(this.props.accounts)) {
            return (
                <div>
                    No accounts configured! Please modify:<br />
                    <code>{this.props.settingsFile}</code>
                </div>
            );
        }

        return (
            <section id="columns">
                {this.renderColumns()}
                <AddNewColumnForm />
            </section>
        );
    }

    render() {
        return (
            <div className="wrapper">
                <Sidebar />
                <Search columnsCount={this.props.columns.length} />
                {this.renderColumnsSection()}
                <Thread />
            </div>
        );
    }
}
