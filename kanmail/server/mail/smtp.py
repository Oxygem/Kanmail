'''
Overrides for Python's builtin SMTP classes which don't handle unicode passwords
correctly, fixed in the below PR pending merge.

https://github.com/python/cpython/pull/15064
'''

import base64
import hmac
import smtplib


class SMTP(smtplib.SMTP):
    def auth(self, mechanism, authobject, *, initial_response_ok=True):
        """Authentication command - requires response processing.
        'mechanism' specifies which authentication mechanism is to
        be used - the valid values are those listed in the 'auth'
        element of 'esmtp_features'.
        'authobject' must be a callable object taking a single argument:
                data = authobject(challenge)
        It will be called to process the server's challenge response; the
        challenge argument it is passed will be a bytes.  It should return
        bytes data that will be base64 encoded and sent to the server.
        Keyword arguments:
            - initial_response_ok: Allow sending the RFC 4954 initial-response
              to the AUTH command, if the authentication methods supports it.
        """
        # RFC 4954 allows auth methods to provide an initial response.  Not all
        # methods support it.  By definition, if they return something other
        # than None when challenge is None, then they do.  See issue #15014.
        mechanism = mechanism.upper()
        initial_response = (authobject() if initial_response_ok else None)
        if initial_response is not None:
            response = smtplib.encode_base64(initial_response.encode('utf-8'), eol='')
            (code, resp) = self.docmd("AUTH", mechanism + " " + response)
        else:
            (code, resp) = self.docmd("AUTH", mechanism)
        # If server responds with a challenge, send the response.
        if code == 334:
            challenge = base64.decodebytes(resp)
            response = smtplib.encode_base64(
                authobject(challenge).encode('utf-8'), eol='')
            (code, resp) = self.docmd(response)
        if code in (235, 503):
            return (code, resp)
        raise smtplib.SMTPAuthenticationError(code, resp)

    def auth_cram_md5(self, challenge=None):
        """ Authobject to use with CRAM-MD5 authentication. Requires self.user
        and self.password to be set."""
        # CRAM-MD5 does not support initial-response.
        if challenge is None:
            return None
        return self.user + " " + hmac.HMAC(
            self.password.encode('utf-8'), challenge, 'md5').hexdigest()


class SMTP_SSL(smtplib.SMTP_SSL, SMTP):
    pass
