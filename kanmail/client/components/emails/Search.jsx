import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import keyboard from 'keyboard.js';
import { makeNoDragElement } from 'window.js';

import emailStoreProxy from 'stores/emailStoreProxy.js';
import searchStore from 'stores/search.js';
import { subscribe } from 'stores/base.jsx';


@subscribe([searchStore, ['open']])
export default class Search extends React.Component {
    static propTypes = {
        open: PropTypes.bool.isRequired,
    }

    constructor(props) {
        super(props);

        this.state = {
            searchValue: null,
        };

        this.executeSearch = _.debounce(
            this.executeSearch,
            500,
        );
    }

    componentDidUpdate(prevProps) {
        if (!prevProps.open && this.props.open) {
            keyboard.disable();
            this.input.focus();
        }

        if (prevProps.open && !this.props.open) {
            this.input.blur();
            keyboard.enable();
        }

        this.executeSearch();
    }

    executeSearch = () => {
        if (this.state.searchValue) {
            emailStoreProxy.search(this.state.searchValue);
        } else {
            emailStoreProxy.stopSearching();
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
            <div id="search" className={this.props.open ? 'open' : ''}>
                <input
                    type="text"
                    value={this.searchValue}
                    onChange={this.handleInputChange}
                    onBlur={(ev) => {
                        if (ev.target.value.length === 0) {
                            searchStore.close();
                        }
                    }}
                    placeholder="Search..."
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    disabled={!this.props.open}
                    ref={(input) => {
                        this.input = input;
                        makeNoDragElement(input);
                    }}
                />
            </div>
        );
    }
}
