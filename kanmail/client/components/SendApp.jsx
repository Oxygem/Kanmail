import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';


export default class SendApp extends React.Component {
    static propTypes = {
        message: PropTypes.object,
    }

    constructor(props) {
        super(props);

        this.state = {
            to: '',
            cc: '',
            bcc: '',
            from: '',
            subject: '',
            body: '',
            quote: '',
        }

        if (props.message) {
            console.log(props.message);
            this.state = _.extend(this.state, {
                to: props.message.reply_to[0][1],
                subject: `RE: ${props.message.subject}`,
                from: props.message.to[1],
                quote: props.message.body,
            });
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
            <section id="new-email">
                <header>&nbsp;</header>

                <form>
                    <label htmlFor="to">To</label>
                    <input
                        id="to"
                        type="text"
                        value={this.state.to}
                        onChange={_.partial(this.handleInputChange, 'to')}
                    />
                    <br />

                    <label htmlFor="cc">CC</label>
                    <input
                        id="cc"
                        type="text"
                        value={this.state.cc}
                        onChange={_.partial(this.handleInputChange, 'cc')}
                    />
                    <label htmlFor="bcc">BCC</label>
                    <input
                        id="bcc"
                        type="text"
                        value={this.state.bcc}
                        onChange={_.partial(this.handleInputChange, 'bcc')}
                    />
                    <br />

                    <label htmlFor="subject">Subject</label>
                    <input
                        id="subject"
                        type="text"
                        value={this.state.subject}
                        onChange={_.partial(this.handleInputChange, 'subject')}
                    />
                    <br />

                    <label htmlFor="body">Message</label>
                    <textarea
                        id="body"
                        value={this.state.body}
                        onChange={this.handleBodyChange}
                    />

                    <br />
                    <input id="include_quote" type="checkbox" />
                    <label id="include_quote" htmlFor="include_quote">Include quote?</label>

                    <blockquote
                        dangerouslySetInnerHTML={{__html: this.state.quote}}
                    />

                    <button type="submit">
                        <i className="fa fa-envelope"></i> Send
                    </button>
                </form>
            </section>
        );
    }
}
