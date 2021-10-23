import 'draft-js/dist/Draft.css';
import 'draftail/dist/draftail.css';

import React from 'react';
import PropTypes from 'prop-types';
import { EditorState } from 'draft-js';
import { convertFromHTML, convertToHTML } from 'draft-convert';
import { DraftailEditor, BLOCK_TYPE, ENTITY_TYPE, INLINE_STYLE } from 'draftail';

import keyboard from 'keyboard.js';


const INLINE_STYLES = [
    {
        type: INLINE_STYLE.BOLD,
        icon: <i className="fa fa-bold"></i>,
    },
    {
        type: INLINE_STYLE.ITALIC,
        icon: <i className="fa fa-italic"></i>,
    },
    {
        type: INLINE_STYLE.UNDERLINE,
        icon: <i className="fa fa-underline"></i>,
    },
    {
        type: INLINE_STYLE.CODE,
        icon: <i className="fa fa-terminal"></i>,
    },
];

const BLOCK_TYPES = [
    {
        type: BLOCK_TYPE.ORDERED_LIST_ITEM,
        icon: <i className="fa fa-list-ol"></i>,
    },
    {
        type: BLOCK_TYPE.UNORDERED_LIST_ITEM,
        icon: <i className="fa fa-list-ul"></i>,
    },
    {
        type: BLOCK_TYPE.BLOCKQUOTE,
        icon: <i className="fa fa-quote-right"></i>,
    },
    {
        type: BLOCK_TYPE.CODE,
        icon: <i className="fa fa-code"></i>,
    },
];

const ENTITY_TYPES = [
    {
        type: ENTITY_TYPE.LINK,
        icon: <i className="fa fa-link"></i>,
    },
];


export default class Editor extends React.Component {
    static propTypes = {
        initialHtml: PropTypes.string,
        placeholder: PropTypes.string,
        controls: PropTypes.array,
    }

    constructor(props) {
        super(props);
        this.keyboardWasEnabled = !keyboard.disabled;

        const initialState = props.initialHtml ?
            EditorState.createWithContent(convertFromHTML(props.initialHtml))
            : EditorState.createEmpty();

        this.state = {
            editorState: initialState,
        };
    }

    getHtml() {
        return convertToHTML(this.state.editorState.getCurrentContent());
    }

    getText() {
        return this.state.editorState.getCurrentContent().getPlainText();
    }

    focus() {
        this.editor.focus();
    }

    render() {
        return (
            <DraftailEditor
                placeholder={this.props.placeholder}
                editorState={this.state.editorState}
                onChange={(editorState) => this.setState({editorState})}
                inlineStyles={INLINE_STYLES}
                blockTypes={BLOCK_TYPES}
                entityTypes={ENTITY_TYPES}
                controls={this.props.controls}
                onFocus={this.keyboardWasEnabled ? keyboard.disable :null}
                onBlur={this.keyboardWasEnabled ? keyboard.enable : null}
                ref={editor => this.editor = editor}
            />
        );
    }
}
