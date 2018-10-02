import React from 'react';

import Filters from 'components/emails/Filters.jsx';
import HeaderErrors from 'components/emails/HeaderErrors.jsx';
import FooterStatus from 'components/emails/FooterStatus.jsx';

import { get } from 'util/requests.js';


export default class Sidebar extends React.Component {
    render() {
        return (
            <section id="sidebar">
                <header>
                    <h1>
                        <span>K-</span>
                        <i className="logo fa fa-envelope-o"></i>
                        <HeaderErrors />
                    </h1>

                    <div>
                        <a
                            className="compose"
                            onClick={() => get('/open-send')}
                        >
                            <i className="fa fa-pencil-square-o"></i>
                            New email
                        </a>
                    </div>
                </header>

                <Filters />

                <footer>
                    <a onClick={() => get('/open-link', {url: 'https://github.com/Fizzadar/kanmail'})}>
                        Kanmail v{window.KANMAIL_VERSION}
                    </a>
                    {window.KANMAIL_DEBUG && ' (debug)'}
                    <br />
                    Beta - <a href="#">unregistered</a>

                    <FooterStatus />
                </footer>
            </section>
        );
    }
}
