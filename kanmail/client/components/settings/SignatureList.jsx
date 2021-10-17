import React from 'react';
import PropTypes from 'prop-types';

import SignatureForm from 'components/settings/SignatureForm.jsx';
import OverlayItemList from 'components/settings/OverlayItemList.jsx';


class SignatureListItem extends React.Component {
    static propTypes = {
        itemData: PropTypes.object.isRequired,
        deleteItem: PropTypes.func.isRequired,
        editItem: PropTypes.func.isRequired,
        itemIndex: PropTypes.number.isRequired,
        moveUp: PropTypes.func.isRequired,
        moveDown: PropTypes.func.isRequired,
    }

    constructor(props) {
        super(props);
        this.state = {
            deleteConfirm: false,
        }
    }

    handleClickCancel = (ev) => {
        ev.preventDefault();

        this.setState({
            deleteConfirm: false,
        });
    }

    handleClickEdit = (ev) => {
        ev.preventDefault();
        this.props.editItem(this.props.itemIndex);
    }

    handleClickDelete = (ev) => {
        ev.preventDefault();

        if (!this.state.deleteConfirm) {
            this.setState({
                deleteConfirm: true,
            });
            return;
        }

        this.props.deleteItem(this.props.itemIndex);
        return;
    }

    renderViewButtons() {
        if (this.state.deleteConfirm) {
            return (
                <div className="right">
                    <button onClick={this.handleClickCancel}>Cancel</button>
                    &nbsp;
                    <button
                        className="cancel"
                        onClick={this.handleClickDelete}
                    >Are you SURE?</button>
                </div>
            );
        }

        return (
            <div className="right">
                <button onClick={this.props.moveUp} className="inactive">
                    <i className="fa fa-arrow-up"></i>
                </button>
                &nbsp;
                <button onClick={this.props.moveDown} className="inactive">
                    <i className="fa fa-arrow-down"></i>
                </button>
                &nbsp;
                <button onClick={this.handleClickEdit}>
                    Edit
                </button>
                &nbsp;
                <button onClick={this.handleClickDelete} className="cancel">
                    {this.state.deleteConfirm ? 'Are you SURE?' : 'Delete'}
                </button>
            </div>
        );
    }

    render() {
        return (
            <div className="account">
                <div className="wide">
                    {this.renderViewButtons()}
                    <strong>{this.props.itemData.name}</strong>
                    <div
                        dangerouslySetInnerHTML={{
                            __html: this.props.itemData.html,
                        }}
                    />
                </div>
            </div>
        );
    }
}


export default class SignatureList extends React.Component {
    static propTypes = {
        signatures: PropTypes.array.isRequired,
        addSignature: PropTypes.func.isRequired,
        deleteSignature: PropTypes.func.isRequired,
        updateSignature: PropTypes.func.isRequired,
        moveSignature: PropTypes.func.isRequired,
        newSignatureFormProps: PropTypes.object,
    }

    render() {
        return <OverlayItemList
            items={this.props.signatures}
            addItem={this.props.addSignature}
            deleteItem={this.props.deleteSignature}
            updateItem={this.props.updateSignature}
            moveItem={this.props.moveSignature}
            itemComponent={SignatureListItem}
            itemFormComponent={SignatureForm}
            newItemFormComponent={SignatureForm}
            newItemName="signature"
        />
    }
}
