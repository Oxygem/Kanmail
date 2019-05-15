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

    // Remove image src attributes to stop them loading immediately
    _.each(tempDocument.body.querySelectorAll(
        'img,image',
    ), img => {
        // Attached images are OK!
        if (_.startsWith(img.src, 'cid:')) {
            return;
        }
        img.setAttribute('original-src', img.src);
        img.src = 'about:blank';
    });

    if (returnElement) {
        return tempDocument.body;
    }
    return tempDocument.body.innerHTML;
}
