import 'react-quill/dist/quill.snow.css';

import React from 'react';
import ReactQuill from 'react-quill';
import Quill from 'quill';

// Use divs > p, see: https://github.com/quilljs/quill/issues/861#issuecomment-239961806
var Block = Quill.import('blots/block');
Block.tagName = 'DIV';
Quill.register(Block, true);


class Editor extends React.Component {
    render() {
        return (
            <ReactQuill {...this.props} />
        );
    }
}

export default Editor;
