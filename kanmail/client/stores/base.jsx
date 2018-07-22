import _ from 'lodash';
import React from 'react';

import { lowercaseFirstLetter } from 'util/string.js';


export function subscribe(...stores) {
    return Component => class Connect extends React.Component {
        constructor(props) {
            super(props);

            const state = {};

            // Attach the store with it's name
            _.each(stores, store => {
                state[lowercaseFirstLetter(store.constructor.storeKey)] = store;

                // Extend by the store's provided properties
                _.extend(state, store.props);
            });

            this.state = state;
        }

        componentDidMount() {
            _.each(stores, store => {
                // Subscribe to store changes
                store.subscribe(this);
            });
        }

        componentWillUnmount() {
            _.each(stores, store => {
                // Unsubscribe to store changes
                store.unsubscribe(this);
            });
        }

        render() {
            return <Component
                {...this.state}
                {...this.props}

                // Make the instance accessible
                ref={ref => this.wrappedComponent = ref}
            />
        }
    };
}


export class BaseStore {
    constructor() {
        this.apps = [];
        this.props = {};
    }

    subscribe(app) {
        this.apps.push(app);
    }

    unsubscribe(app) {
        this.apps = _.without(this.apps, app);
    }

    triggerUpdate() {
        // For each wrapped app, set it's state with the stores props
        _.each(this.apps, app => {
            app.setState(this.props);
        });
    }
}
