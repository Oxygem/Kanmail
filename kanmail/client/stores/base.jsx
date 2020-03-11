import _ from 'lodash';
import React from 'react';

import { lowercaseFirstLetter } from 'util/string.js';


const getStorePropNames = store => {
    let propNames = _.keys(store.props);

    if (_.isArray(store)) {
        [store, propNames] = store;
    }

    return [store, propNames];
}


export function subscribe(...stores) {
    return Component => class Connect extends React.Component {
        constructor(props) {
            super(props);

            const state = {};

            // Attach the store with it's name
            _.each(stores, storeConfig => {
                const [store, propNames] = getStorePropNames(storeConfig);

                state[lowercaseFirstLetter(store.constructor.storeKey)] = store;

                // Extend by the store's provided properties
                _.extend(state, _.pick(store.props, propNames));
            });

            this.state = state;
        }

        componentDidMount() {
            _.each(stores, storeConfig => {
                const [store, propNames] = getStorePropNames(storeConfig);
                store.subscribe(this, propNames);
            });
        }

        componentWillUnmount() {
            _.each(stores, storeConfig => {
                const [store, propNames] = getStorePropNames(storeConfig);
                store.unsubscribe(this, propNames);
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

    subscribe(app, propNames) {
        this.apps.push([app, propNames]);
    }

    unsubscribe(app, propNames) {
        this.apps = _.without(this.apps, [app, propNames]);
    }

    triggerUpdate(updatedPropNames) {
        if (!updatedPropNames) {
            updatedPropNames = _.keys(this.props);
        }

        // For each wrapped app, set it's state with the stores props
        _.each(this.apps, app => {
            const [component, propNames] = app;
            const intersection = _.intersection(updatedPropNames, propNames);
            if (intersection.length > 0) {
                component.setState(_.pick(this.props, propNames));
            }
        });
    }
}
