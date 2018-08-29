import _ from 'lodash';


export function cleanHtml(html, returnElement=false) {
    // Parse the message into DOM
    const parser = new DOMParser();
    const tempDocument = parser.parseFromString(html, 'text/html');

    // Strip crappy tags
    _.each(tempDocument.body.querySelectorAll(
        'link,meta,style,title,script',
    ), element => {
        element.parentNode.removeChild(element);
    });

    if (returnElement) {
        return tempDocument.body;
    }
    return tempDocument.body.innerHTML;
}
