# Development

First install the requirements:

```
# Generic development requirements
pip install -r requirements/development.txt

# Platform specific requirements
pip install -r requirements/<macos etc>.txt
```

To start the server + webpack-server:

```
honcho start
```

Then go to [http://localhost:4420](https://localhost:4420) to view/develop the app in a browser of your choice.

Or - to start the full windowed app, use:

```
honcho start -f Procfile-app
```

Note that the webserver does not auto-reload when running in app mode.

## MacOS

Python _must_ be configured `--with-framework`. See [this StackOverflow answer](https://stackoverflow.com/a/15752676/352488) to to check whether this is enabled.

To build/release you'll need to intsall GNU tar, which can be done with brew:

```
brew install gnu-tar
```

# Releases

Version numbers are generated at build in the date-based format: `MAJOR.YYMMDDhhmm`.
