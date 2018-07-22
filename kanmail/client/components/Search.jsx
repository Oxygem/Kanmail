import _ from 'lodash';
import React from 'react';
// import PropTypes from 'prop-types';

import keyboard from 'keyboard.js';
import emailStoreProxy from 'stores/emailStoreProxy.js';


export default class Search extends React.Component {
    static propTypes = {}

    constructor(props) {
        super(props);

        this.state = {
            searchValue: null,
        };

        this.executeSearch = _.debounce(
            this.executeSearch,
            300,
        );
    }

    componentDidUpdate() {
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
            <div id="search">
                <input
                    type="text"
                    value={this.searchValue}
                    onChange={this.handleInputChange}
                    onFocus={keyboard.disable}
                    onBlur={keyboard.enable}
                    placeholder="Search"
                />
            </div>
        );
    }
}
