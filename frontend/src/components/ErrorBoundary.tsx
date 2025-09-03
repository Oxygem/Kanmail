import React from "react";

import showErrorInformation from "./ErrorInformation.tsx";

interface IErrorBoundaryProps {
    children?: React.ReactNode;
}

interface IErrorBoundaryState {
    hasError?: boolean;
}

export default class ErrorBoundary extends React.Component<IErrorBoundaryProps, IErrorBoundaryState> {
    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI.
        return { hasError: true };
    }

    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
        }
    }

    render() {
        if (this.state!.hasError) {
            return showErrorInformation({ error: "", componentStack: null })
        }
        return this.props.children;
    }
}
