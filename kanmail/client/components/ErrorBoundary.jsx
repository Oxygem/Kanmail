import React from 'react';
import PropTypes from 'prop-types';


export default class ErrorBoundary extends React.Component {
    static propTypes = {
        children: PropTypes.object.isRequired,
    }

    constructor(props) {
        super(props)

        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    componentDidCatch(error, info) {
        this.setState({
            hasError: true,
            error: error,
            errorInfo: info,
        });
    }

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        return (
            <div id="no-app">
                <h1><img src="/favicon.ico" /> Something broke!</h1>
                <p><a onClick={() => window.location.reload()}>Click here to reload!</a></p>
                <p>So this is embarrassing - something broke! If this error persists, please go to: <a target="_blank" rel="noreferrer" href="https://kanmail.io/support">kanmail.io/support</a>.</p>
                <pre><code>{this.state.errorInfo.componentStack}</code></pre>
            </div>
        );
    }
}
