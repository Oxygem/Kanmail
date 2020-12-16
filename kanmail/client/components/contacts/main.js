import bootApp from 'boot.jsx';
import ContactsApp from 'components/contacts/ContactsApp.jsx';

bootApp(ContactsApp, 'div[data-contacts-app]', rootElement => ({
    contacts: JSON.parse(rootElement.getAttribute('data-contacts')),
}));
