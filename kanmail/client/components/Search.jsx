import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import keyboard from 'keyboard.js';

import emailStoreProxy from 'stores/emailStoreProxy.js';
import settingsStore from 'stores/settings.js';
import { subscribe } from 'stores/base.jsx';


@subscribe(settingsStore)
export default class Search extends React.Component {
    static propTypes = {
        columnsCount: PropTypes.number.isRequired,
    }

    constructor(props) {
        super(props);

        this.state = {
            searchValue: null,
            searchWidth: 100,
        };

        this.executeSearch = _.debounce(
            this.executeSearch,
            300,
        );
    }

    componentDidMount() {
        this.calculateWidth();
    }

    componentDidUpdate() {
        this.calculateWidth();
        this.executeSearch();
    }

    executeSearch = () => {
        if (this.state.searchValue) {
            emailStoreProxy.search(this.state.searchValue);
        } else {
            emailStoreProxy.stopSearching();
        }
    }

    calculateWidth = () => {
        const columnElements = document.querySelectorAll('div.column');

        if (!columnElements) {
            return;
        }

        const columnsWidth = _.sum(_.map(
            columnElements,
            column => column.clientWidth,
        ));

        const searchWidth = _.max([
            100,
            columnsWidth + this.props.columnsCount - 18,
        ]);

        if (this.state.searchWidth === searchWidth) {
            return;
        }

        this.setState({
            searchWidth,
        });
    }

    handleInputChange = (ev) => {
        const value = ev.target.value || null;

        this.setState({
            searchValue: value,
        });
    }

    render() {

        return (
            <section id="search">
                <input
                    type="text"
                    value={this.searchValue}
                    onChange={this.handleInputChange}
                    onFocus={keyboard.disable}
                    onBlur={keyboard.enable}
                    placeholder="type to search..."
                    style={{
                        width: `${this.state.searchWidth}px`,
                    }}
                />
            </section>
        );
    }
}
