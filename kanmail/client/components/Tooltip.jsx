import React from 'react';
import PropTypes from 'prop-types';

import tooltipStore from 'stores/tooltip.js';
import { subscribe } from 'stores/base.jsx';


@subscribe(tooltipStore)
export class TheTooltip extends React.Component {
    static propTypes = {
        visible: PropTypes.bool.isRequired,
        targetElement: PropTypes.object,
        text: PropTypes.oneOfType([
            PropTypes.object,
            PropTypes.string,
        ]),
        extraTop: PropTypes.number,
    }

    render() {
        if (!this.props.visible) {
            return null;
        }

        const position = this.props.targetElement.getBoundingClientRect();
        const extraTop = this.props.extraTop || 0;

        return (
            <div
                className="tooltip"
                style={{
                    top: position.top - 4 + extraTop,
                    left: position.left + position.width + 10,
                }}
            >{this.props.text}</div>
        );
    }
}


export default class Tooltip extends React.Component {
    static propTypes = {
        children: PropTypes.node.isRequired,
        text: PropTypes.oneOfType([
            PropTypes.object,
            PropTypes.string,
        ]),
        extraTop: PropTypes.number,
    }

    componentWillUnmount() {
        tooltipStore.hide();
    }

    render() {
        return (
            <div
                className="tooltip-wrapper"
                onMouseEnter={() => tooltipStore.show(
                    this.props.text,
                    this.element,
                    this.props.extraTop,
                )}
                onMouseLeave={() => tooltipStore.hide()}
                ref={div => this.element = div}
            >
                {this.props.children}
            </div>
        );
    }
}
