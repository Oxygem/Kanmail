import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import keyboard from 'keyboard.js';
import { makeNoDragElement } from 'window.js';

import emailStoreController from 'stores/emails/controller.js';
import searchStore from 'stores/search.js';
import { subscribe } from 'stores/base.jsx';


@subscribe([searchStore, ['isSearching']])
export default class Search extends React.Component {
    static propTypes = {
        isSearching: PropTypes.bool.isRequired,
    }

    constructor(props) {
        super(props);

        this.state = {
            searchValue: null,
        };

        this.executeSearch = _.debounce(
            this._executeSearch,
            500,
        );
    }

    componentDidUpdate(prevProps) {
        if (!prevProps.isSearching && this.props.isSearching) {
            keyboard.disable();
            this.input.focus();
        }

        if (prevProps.isSearching && !this.props.isSearching) {
            this.input.blur();
            keyboard.enable();
        }

        this.executeSearch();
    }

    _executeSearch = () => {
        if (this.state.searchValue) {
            emailStoreController.search(this.state.searchValue);
        }
    }

    handleInputChange = (ev) => {
        const value = ev.target.value || null;

        this.setState({
            searchValue: value,
        });
    }

    render() {
        return (
            <div id="search" className={this.props.isSearching ? 'open' : ''}>
                <input
                    type="text"
                    value={this.searchValue}
                    onChange={this.handleInputChange}
                    placeholder="Search..."
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    disabled={!this.props.isSearching}
                    ref={(input) => {
                        this.input = input;
                        makeNoDragElement(input);
                    }}
                />
            </div>
        );
    }
}
