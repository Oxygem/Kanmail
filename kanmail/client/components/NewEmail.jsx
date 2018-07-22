import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';


export default class NewEmail extends React.Component {
    static propTypes = {
        message: PropTypes.object,
    }

    constructor(props) {
        super(props);

        // const body = props.message.body || '';
        const to = props.message.from[0] || '';

        this.state = {
            to: to,
            cc: '',
            bcc: '',
            from: '',
            subject: '',
            body: '',
        }
    }

    handleInputChange = (field, ev) => {
        this.setState({
            [field]: ev.target.value,
        });
    }

    handleBodyChange = (ev) => {
        ev.persist();

        this.setState({
            body: ev.target.value,
        });

        // TODO: this changes by 2px each time closer to the new value - partial
        // state update at that time?
        ev.target.style.height = `${ev.target.scrollHeight}px`;
    }

    render() {
        return (
            <form id="new-email">
                <input
                    type="text"
                    placeholder="To"
                    value={this.state.to}
                    onChange={_.partial(this.handleInputChange, 'to')}
                />
                <input
                    type="text"
                    placeholder="CC"
                    value={this.state.cc}
                    onChange={_.partial(this.handleInputChange, 'cc')}
                />
                <input
                    type="text"
                    placeholder="BCC"
                    value={this.state.bcc}
                    onChange={_.partial(this.handleInputChange, 'bcc')}
                />
                <input
                    type="text"
                    className="subject"
                    placeholder="Subject"
                    value={this.state.subject}
                    onChange={_.partial(this.handleInputChange, 'subject')}
                />
                <textarea
                    value={this.state.body}
                    onChange={this.handleBodyChange}
                />

                <button type="submit">
                    <i className="fas fa-envelope"></i> Send
                </button>
            </form>
        );
    }
}
