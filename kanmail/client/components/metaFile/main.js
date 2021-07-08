import bootApp from 'boot.jsx';
import MetaFileApp from 'components/metaFile/MetaFileApp.jsx';

bootApp(MetaFileApp, 'meta-file', rootElement => ({
    fileTitle: rootElement.getAttribute('data-file-title'),
    fileData: rootElement.getAttribute('data-file'),
}));
