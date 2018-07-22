import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';
import { DragDropContext } from 'react-dnd';
import HTML5Backend from 'react-dnd-html5-backend';

import Search from 'components/Search.jsx';
import Filters from 'components/Filters.jsx';
import EmailColumn from 'components/EmailColumn.jsx';
import MainColumn from 'components/MainColumn.jsx';
import AddNewColumnForm from 'components/AddNewColumnForm.jsx';
import Thread from 'components/Thread.jsx';

import mainEmailStore from 'emails/main.js';
import settingsStore from 'stores/settings.js';
import { subscribe } from 'stores/base.jsx';

import { get } from 'util/requests.js';
import { addMessage } from 'util/messages.js';


@subscribe(settingsStore)
@DragDropContext(HTML5Backend)
export default class App extends React.Component {
    static propTypes = {
        columns: PropTypes.array.isRequired,
        accounts: PropTypes.object.isRequired,
        settingsFile: PropTypes.string.isRequired,
        systemSettings: PropTypes.object.isRequired,
        folderNames: PropTypes.array,
    }

    componentDidMount() {
        const { initial_batches, batch_size } = this.props.systemSettings;
        const initialBatchSize = batch_size * initial_batches;

        // Load up the archive, sent and trash folders - their columns aren't
        // visible initially, but the emails are likely referenced in threads
        // from the visible folders, so load them up (client side threading).
        _.each(['archive', 'sent', 'trash'], folder => (
            mainEmailStore.getFolderEmails(
                folder,
                {query: {
                    reset: true,
                    batch_size: initialBatchSize,
                }},
            )
        ));
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
                <section id="folders">
                    <h1>
                        <span>K-</span>
                        <i className="logo fa fa-envelope-o"></i>

                        <span className="right">
                            <a
                                onClick={() => get('/open-send').catch(() => {
                                    addMessage('Could not open send window!', 'critical');
                                })}
                            >
                                <i className="fa fa-pencil-square-o"></i>
                            </a>
                        </span>
                    </h1>

                    <Search />
                    <Filters />

                    <footer>
                        <a onClick={() => get('/open-link', {url: 'https://github.com/Fizzadar/kanmail'})}>
                            Kanmail v{window.KANMAIL_VERSION}
                        </a>
                        {window.KANMAIL_DEBUG && ' (debug)'}
                        <br />
                        Beta - <a href="#">unregistered</a>
                    </footer>
                </section>

                {this.renderColumnsSection()}

                <Thread />
            </div>
        );
    }
}
