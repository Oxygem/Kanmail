import React from 'react';
import PropTypes from 'prop-types';

import tooltipStore from 'stores/tooltip.js';
import { subscribe } from 'stores/base.jsx';


@subscribe(tooltipStore)
export class TheTooltip extends React.Component {
    static propTypes = {
        visible: PropTypes.bool.isRequired,
        text: PropTypes.string.isRequired,
        targetElement: PropTypes.object.isRequired,
    }

    render() {
        if (!this.props.visible) {
            return null;
        }

        const position = this.props.targetElement.getBoundingClientRect();

        return (
            <div
                className="tooltip"
                style={{
                    top: position.top - 4,
                    left: position.left + position.width + 10,
                }}
            >{this.props.text}</div>
        );
    }
}


export default class Tooltip extends React.Component {
    static propTypes = {
        children: PropTypes.node.isRequired,
        text: PropTypes.string.isRequired,
    }

    componentWillUnmount() {
        tooltipStore.hide();
    }

    render() {
        return (
            <div
                className="tooltip-wrapper"
                onMouseEnter={() => tooltipStore.show(this.props.text, this.element)}
                onMouseLeave={() => tooltipStore.hide()}
                ref={div => this.element = div}
            >
                {this.props.children}
            </div>
        );
    }
}
