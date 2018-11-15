# Development

Version numbers are generated at build in the date-based format: `MAJOR.YYMMDDhhmm`.

```
# Start the server+webpack-server
honcho start

# OR - start the app itself (full pywebview window with debug - right click)
honcho start -f Procfile-app
```

## MacOS

Whatever Python version/virtualenv/pyenv combo you choose to use - most importantly note that to run the app itself (rather than via a browser), Python _must_ be configured `--with-framework`. See [this StackOverflow answer](https://stackoverflow.com/a/15752676/352488) to to check whether this is enabled.

```
# Install the MacOS requirements
pip install -r requirements/macos.pip`
```
