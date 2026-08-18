import _ from "lodash";
import React from "react";

import { lowercaseFirstLetter } from "../util/string.js";

const getStorePropNames = (store) => {
  let propNames = _.keys(store.props);

  if (_.isArray(store)) {
    [store, propNames] = store;

    // A name the store doesn't have subscribes to nothing and injects
    // undefined - the component renders as if the value were empty and never
    // updates, with nothing to say why
    const unknown = _.difference(propNames, _.keys(store.props));
    if (unknown.length) {
      console.error(
        `[store] ${store.constructor.storeKey || store.constructor.name}`
        + ` has no prop(s): ${unknown.join(", ")}`,
      );
    }
  }

  return [store, propNames];
};

export function subscribe(...stores) {
  return (Component: any): any =>
    class extends React.Component {
      wrappedComponent: React.Component

      constructor(props) {
        super(props);

        const state = {};

        // Attach the store with it's name
        _.each(stores, (storeConfig) => {
          const [store, propNames] = getStorePropNames(storeConfig);

          // Extend by the store's provided properties
          _.extend(state, _.pick(store.props, propNames));
        });

        this.state = state;
      }

      componentDidMount() {
        _.each(stores, (storeConfig) => {
          const [store, propNames] = getStorePropNames(storeConfig);
          store.subscribe(this, propNames);
        });
      }

      componentWillUnmount() {
        _.each(stores, (storeConfig) => {
          const [store, propNames] = getStorePropNames(storeConfig);
          store.unsubscribe(this, propNames);
        });
      }

      render(): React.ReactNode {
        return (
          <Component
            {...this.state}
            {...this.props}
            // Make the instance accessible
            ref={(ref) => (this.wrappedComponent = ref!)}
          />
        );
      }
    };
}

export class BaseStore {
  // Properties passed to subscribers
  props: any;

  // Array of subscribed components and optional prop keys they are subscribed to
  apps: {
    component: React.Component,
    propNames: string[],
  }[];

  constructor() {
    this.apps = [];
    this.props = {};
  }

  subscribe(component: React.Component, propNames: string[]) {
    this.apps.push({
      component: component,
      propNames: propNames
    });
  }

  unsubscribe(app: React.Component) {
    this.apps = _.filter(this.apps, ({ component }) => component !== app);
  }

  triggerUpdate(updatedPropNames?) {
    if (!updatedPropNames) {
      updatedPropNames = _.keys(this.props);
    }

    // For each wrapped app, set it's state with the stores props
    _.each(this.apps, (app) => {
      const { component, propNames } = app;
      const intersection = _.intersection(updatedPropNames, propNames);
      if (intersection.length > 0) {
        component.setState(_.pick(this.props, propNames));
      }
    });
  }
}
