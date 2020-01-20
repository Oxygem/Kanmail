# Development

## Setup your system

### MacOS

Python _must_ be configured `--with-framework`. See [this StackOverflow answer](https://stackoverflow.com/a/15752676/352488) to to check whether this is enabled.

To build/release you'll need to intsall GNU tar, which can be done with brew:

```
brew install gnu-tar
```

### Linux/Ubuntu

For `qt` to install properly you'll need:

```
apt install build-essential pkg-config git libcairo2-dev libgirepository1.0-dev
```

Then, _after_ requirements are installed you need to edit [this pyinstaller file](https://github.com/pyinstaller/pyinstaller/blob/develop/PyInstaller/hooks/hook-gi.repository.Gtk.py#L24) and comment out the lines that add fontconfig/icons/themes (prevents the resultant bundle being >200mb).

## Install Python requirements

First install the requirements:

```
# Generic development requirements
pip install -r requirements/development.txt

# Platform specific requirements
pip install -r requirements/[macos|linux|windows].txt
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


# Releases

Version numbers are generated at build in the date-based format: `MAJOR.YYMMDDhhmm`.
