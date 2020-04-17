export function getAccountIconName(account) {
    if (account.imap_connection.host === 'imap.gmail.com') {
        return 'google';
    }
    return 'envelope';
}
