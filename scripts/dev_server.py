import sys
sys.path.append('.')  # noqa


from kanmail import settings
from kanmail.server.app import app, boot


# Bootstrap the server
boot()

# Run the dev server
app.run(debug=True, threaded=True, port=settings.SERVER_PORT)
