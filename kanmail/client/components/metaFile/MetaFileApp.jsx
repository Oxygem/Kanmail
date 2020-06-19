import React from 'react';
import PropTypes from 'prop-types';

import HeaderBar from 'components/HeaderBar.jsx';

import img from 'icon-pink.png';
import keyboard from 'keyboard.js';


export default class MetaApp extends React.Component {
    static propTypes = {
        fileTitle: PropTypes.string.isRequired,
        fileData: PropTypes.string.isRequired,
    }

    constructor(props) {
        super(props);
        keyboard.disable();
    }

    render() {
        return <section className={window.KANMAIL_PLATFORM}>
            <HeaderBar />

            <section id="meta-file">
                <h2 className="no-select"><img src={img} width="48px" /> {this.props.fileTitle}</h2>
                <div
                    dangerouslySetInnerHTML={{
                        __html: this.props.fileData,
                    }}
                />
            </section>
        </section>;
    }
}
