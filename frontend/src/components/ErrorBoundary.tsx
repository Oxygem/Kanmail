import React from "react";

import { trackError } from "../util/analytics.ts";
import showErrorInformation from "./ErrorInformation.tsx";

interface IErrorBoundaryProps {
    children?: React.ReactNode;
}

interface IErrorBoundaryState {
    hasError: boolean;
    stack?: string;
    message?: string;
}

export default class ErrorBoundary extends React.Component<IErrorBoundaryProps, IErrorBoundaryState> {
    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI.
        return {
            hasError: true,
            stack: error.stack,
            message: error.message,
        };
    }

    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
        }
    }

    componentDidCatch(error: Error) {
        trackError("react_boundary", error.message, error.stack);
    }

    render() {
        if (this.state!.hasError) {
            return showErrorInformation({ error: this.state.message, componentStack: this.state.stack })
        }
        return this.props.children;
    }
}
