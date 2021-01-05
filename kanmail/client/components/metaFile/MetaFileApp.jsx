import React from 'react';
import PropTypes from 'prop-types';

import img from 'icon-pink.png';
import { makeDragElement } from 'window.js';


export default class MetaApp extends React.Component {
    static propTypes = {
        fileTitle: PropTypes.string.isRequired,
        fileData: PropTypes.string.isRequired,
    }

    render() {
        return <section>
            <header className="meta header-bar" ref={makeDragElement}>
                <h2 className="no-select"><img src={img} width="36px" /> {this.props.fileTitle}</h2>
            </header>

            <section id="meta-file">
                <div
                    dangerouslySetInnerHTML={{
                        __html: this.props.fileData,
                    }}
                />
            </section>
        </section>;
    }
}
