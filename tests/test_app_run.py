import re
import sys

from subprocess import PIPE, Popen
from time import sleep
from unittest import TestCase

import requests


SESSION_ID_REGEX = r'App session token is: ([a-z0-9\-]+)'
WINDOW_ID_REGEX = r'Opening window \(([a-z0-9\-]+)\)'


class TestAppRun(TestCase):
    def test_app_run(self):
        p = Popen((sys.executable, 'main.py'), stderr=PIPE)

        try:
            sleep(5)

            output = p.stderr.peek().decode().splitlines()

            session_id = None
            window_id = None

            for line in output:
                session_id_match = re.findall(SESSION_ID_REGEX, line)
                if session_id_match:
                    session_id = session_id_match

                window_id_match = re.findall(WINDOW_ID_REGEX, line)
                if window_id_match:
                    window_id = window_id_match

            assert session_id is not None
            assert window_id is not None

            ping_response = requests.get('http://127.0.0.1:4420/ping')
            ping_response.raise_for_status()
            assert ping_response.json() == {'ping': 'pong'}

            close_window_response = requests.get(
                'http://127.0.0.1:4420/close-window',
                params={
                    'Kanmail-Session-Token': session_id,
                    'window_id': window_id,
                },
            )
            close_window_response.raise_for_status()

            assert close_window_response.status_code == 204
            assert p.poll() is None

        finally:
            attempts = 0

            while p.poll() is not None:
                if attempts > 30:
                    break

                p.terminate()
                sleep(1)
                attempts += 1
