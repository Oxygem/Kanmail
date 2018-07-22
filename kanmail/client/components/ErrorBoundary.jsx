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
            <div>
                <h1>Something broke!</h1>
                <p><a href="/">Click here to reload!</a></p>
                <p>So this is embarrassing - something broke: <strong>{this.state.error.message}</strong></p>
                <pre><code>{this.state.errorInfo.componentStack}</code></pre>
            </div>
        );
    }
}
