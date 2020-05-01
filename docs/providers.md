[← back to docs](./README.md)

# Email Providers

Kanmail _should_ be compatible with any email provider/server that provides `IMAP` and `SMTP`. This page lists tested providers/servers along with any specific instructions, features or limitations.

+ [**Gmail / GSuite**](#gmail--gsuite)
+ [**Outlook**](#outlook)
+ [**Fastmail**](#fastmail)
+ [**iCloud**](#icloud)

For more complex connections, see [**advanced settings**](#advanced-settings).


## Gmail / GSuite

Working. Requirements:

+ An app password (which requires 2FA enabled), see [the Google documentation](https://support.google.com/accounts/answer/185833)
+ IMAP/SMTP enabled in GMail, see [the Google documentation](https://support.google.com/mail/answer/7126229)

Features: gmail-like search.

## Outlook

Working using normal username & password.

## Fastmail

Working. Requires an app password, see [the Fastmail documentation](https://www.fastmail.com/help/clients/defineimap.html).

## iCloud

Working. Requires an app password, see [the iCloud documentation](https://support.apple.com/en-us/HT202304).


## Advanced Settings

Kanmail offers some advanced account settings for more complex connection setups. **Do not change these unless you know what you are doing**.

### Disable SSL hostname verification

If you _expect_ the SSL certificate hostname not to match, verification can be disabled within the account settings.
