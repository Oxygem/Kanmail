import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';


export default class OverlayItemList extends React.Component {
    static propTypes = {
        items: PropTypes.array.isRequired,
        addItem: PropTypes.func.isRequired,
        deleteItem: PropTypes.func.isRequired,
        updateItem: PropTypes.func.isRequired,
        moveItem: PropTypes.func.isRequired,
        newItemName: PropTypes.string.isRequired,
        // accountNameToConnected: PropTypes.object.isRequired,
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
                editAccount={this.handleClickEditItem}
                moveUp={_.partial(this.props.moveItem, i, -1)}
                moveDown={_.partial(this.props.moveItem, i, 1)}
                // connected={
                //     this.props.accountNameToConnected
                //     && this.props.accountNameToConnected[accountSettings.name]
                // }
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
