from kanmail.log import logger

from .connection import ImapConnectionPool, SmtpConnection
from .folder import Folder
from .message import make_email_message


class Account(object):
    capabilities = None

    def __init__(self, name, settings):
        self.name = name

        # Create folder map dicts
        self.reset()

        # Set the settings
        self.settings = settings

        # Setup/wrap IMAP connection
        self.connection_pool = ImapConnectionPool(
            self,
            **settings['imap_connection'],
        )

        # Prepare SMTP connection getter
        self.smtp_connection = SmtpConnection(
            self,
            **settings['smtp_connection'],
        )

    def __str__(self):
        return self.name

    def reset(self):
        # Map of folder name -> Folder object
        self.folders = {}
        self.query_folders = {}

    def get_imap_connection(self, *args, **kwargs):
        return self.connection_pool.get_connection(*args, **kwargs)

    def get_smtp_connection(self, *args, **kwargs):
        return self.smtp_connection.get_connection(*args, **kwargs)

    def get_capabilities(self):
        if self.capabilities is None:
            with self.connection_pool.get_connection() as connection:
                self.capabilities = connection.capabilities()
                logger.debug(f'Loaded capabilities for {self.name}: {self.capabilities}')

        return self.capabilities

    def get_folders(self):
        '''
        List all available folders for this account.
        '''

        folder_names = []

        with self.get_imap_connection() as connection:
            for flags, delimeter, name in connection.list_folders():
                folder_names.append(name)

        return folder_names

    def get_folder(self, folder_alias, query=None):
        '''
        Get a Folder object for this account.
        '''

        folder_name = folder_alias
        if folder_alias in self.settings['folders']:
            folder_name = self.settings['folders'][folder_alias]

        # Is this a temporary query-based folder?
        cache = self.query_folders if query else self.folders
        cache_key = ''.join((folder_name, query)) if query else folder_name

        if cache_key not in cache:
            cache[cache_key] = Folder(
                folder_name, folder_alias,
                account=self,
                query=query,
            )

        return cache[cache_key]

    def ensure_folder_exists(self, folder):
        folder = self.get_folder(folder)

        if not folder.exists:
            logger.debug(f'Creating folder {self.name}/{folder.name}')

            with self.get_imap_connection() as connection:
                connection.create_folder(folder.name)

            folder.get_and_set_email_uids()

        return folder.name

    def send_email(self, **send_kwargs):
        message = make_email_message(**send_kwargs)
        subject = send_kwargs.get('subject')

        with self.smtp_connection.get_connection() as smtp:
            logger.debug((
                f'Send email via SMTP/{self.smtp_connection}: '
                f'{subject}, from {message["From"]} => {message["To"]}'
            ))
            smtp.send_message(message)
