import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import { arrayMove } from 'util/array.js';


// Mixin classes for components managing overlay list state.

function makeMixin(name, stateKey, BaseClass=React.Component) {
    return class SettingsMixin extends BaseClass {
        constructor() {
            super();

            this[`delete${name}`] = (itemIndex) => {
                console.log('DELETE?', itemIndex, stateKey, this.state);
                const items = _.filter(
                    this.state[stateKey],
                    (_, i) => i !== itemIndex,
                );
                this.setState({[stateKey]: items});
            }

            this[`update${name}`] = (itemIndex, newSettings) => {
                if (!this.state[stateKey][itemIndex]) {
                    throw Error('nope');
                }

                const items = this.state[stateKey];
                items[itemIndex] = newSettings;
                this.setState({[stateKey]: items});
            }

            this[`add${name}`] = (newSettings) => {
                const items = this.state[stateKey];
                items.push(newSettings);
                this.setState({[stateKey]: items});
            }

            this[`move${name}`] = (index, position) => {
                const items = this.state[stateKey];
                arrayMove(items, index, index + position);
                this.setState({[stateKey]: items});
            }
        }
    }
}

// Account settings only mixin
export class AccountSettingsMixin extends makeMixin('Account', 'accounts') {
    addAccount = (newSettings) => {
        const accounts = this.state.accounts;
        accounts.push(newSettings);

        const accountNameToConnected = this.state.accountNameToConnected;
        accountNameToConnected[newSettings.name] = true;

        this.setState({accounts, accountNameToConnected});
    }
}

// Account + signature settings mixin
export class AccountAndSignatureSettingsMixin extends makeMixin(
    'Signature', 'signatures', AccountSettingsMixin,
) {}


// Base component for an overlay item list

export default class OverlayItemList extends React.Component {
    static propTypes = {
        items: PropTypes.array.isRequired,
        addItem: PropTypes.func.isRequired,
        deleteItem: PropTypes.func.isRequired,
        updateItem: PropTypes.func.isRequired,
        moveItem: PropTypes.func.isRequired,
        newItemName: PropTypes.string.isRequired,
        extraItemProps: PropTypes.object,
    }

    constructor(props) {
        super(props);

        this.state = {
            addingItem: false,
            editingItemIndex: null,
        };
    }

    handleClickAddItem = () => {
        this.setState({
            addingItem: true,
            editingItemIndex: null,
        });
    }

    handleClickCancelAddItem = () => {
        this.setState({
            addingItem: false,
            editingItemIndex: null,
        });
    }

    handleClickEditItem = (itemIndex) => {
        this.setState({
            addingItem: false,
            editingItemIndex: itemIndex,
        });
    }

    handleClickCancelEditItem = () => {
        this.setState({
            addingItem: false,
            editingItemIndex: null,
        });
    }

    renderItems() {
        return _.map(this.props.items, (itemData, i) => (
            <this.props.itemComponent
                key={`${i}-${itemData.name}`}
                itemIndex={i}
                itemData={itemData}
                deleteItem={this.props.deleteItem}
                editItem={this.handleClickEditItem}
                moveUp={_.partial(this.props.moveItem, i, -1)}
                moveDown={_.partial(this.props.moveItem, i, 1)}
                {...this.props.extraItemProps}
            />
        ));
    }

    renderItemForm() {
        if (this.state.addingItem) {
            return (
                <div className="account-form-overlay">
                    <this.props.newItemFormComponent
                        closeForm={this.handleClickCancelAddItem}
                        addItem={this.props.addItem}
                    />
                </div>
            );
        }

        if (!_.isNull(this.state.editingItemIndex)) {
            return (
                <div className="account-form-overlay">
                    <this.props.itemFormComponent
                        connected={true}
                        itemIndex={this.state.editingItemIndex}
                        itemData={this.props.items[this.state.editingItemIndex]}
                        updateItem={this.props.updateItem}
                        closeForm={this.handleClickCancelEditItem}
                    />
                </div>
            );
        }

        return null;
    }

    render() {
        return (
            <div id="accounts">
                {this.renderItems()}
                <button className="submit" onClick={this.handleClickAddItem}>
                    Add new {this.props.newItemName}
                </button>
                {this.renderItemForm()}
            </div>
        );
    }
}
