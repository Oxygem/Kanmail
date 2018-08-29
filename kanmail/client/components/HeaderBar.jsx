import React from 'react';


export default class HeaderBar extends React.Component {
    render() {
        return (
            <header>
                <h1 id="logo">
                    <span>K-</span>
                    <i className="logo fa fa-envelope-o"></i>
                </h1>
            </header>
        );
    }
}
