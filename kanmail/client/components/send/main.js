import bootApp from 'boot.jsx';
import SendApp from 'components/send/SendApp.jsx';

bootApp(SendApp, 'send', rootElement => ({
    contacts: JSON.parse(rootElement.getAttribute('data-contacts')),
    message: JSON.parse(rootElement.getAttribute('data-reply')),
}));
