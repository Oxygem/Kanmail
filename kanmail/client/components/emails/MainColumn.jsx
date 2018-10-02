import React from 'react';
import PropTypes from 'prop-types';

import EmailColumn from 'components/emails/EmailColumn.jsx';

import filterStore from 'stores/filters.js';
import { subscribe } from 'stores/base.jsx';


// A wrapper around the EmailColumn component for the main column which changes
@subscribe(filterStore)
export default class MainColumn extends React.Component {
    static propTypes = {
        mainColumn: PropTypes.string.isRequired,
        filterStore: PropTypes.object.isRequired,
        getPreviousColumn: PropTypes.func.isRequired,
        getNextColumn: PropTypes.func.isRequired,
        columnsCount: PropTypes.number.isRequired,
    }

    getDecoratedComponentInstance() {
        return this.emailColumn;
    }

    render() {
        const column = this.props.mainColumn;

        return <EmailColumn
            key={column}
            id={column}
            isMainColumn={true}

            // Pass down column select functions
            getPreviousColumn={this.props.getPreviousColumn}
            getNextColumn={this.props.getNextColumn}

            ref={ref => this.emailColumn = ref}
        />;
    }
}
