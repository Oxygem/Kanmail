import bootApp from 'boot.jsx';
import MetaFileApp from 'components/metaFile/MetaFileApp.jsx';

bootApp(MetaFileApp, 'div[data-meta-file-app]', rootElement => ({
    fileTitle: rootElement.getAttribute('data-file-title'),
    fileData: rootElement.getAttribute('data-file'),
}));
