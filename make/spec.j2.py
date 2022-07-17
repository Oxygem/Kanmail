a = Analysis(  # noqa: F821
    [r'{{ root_dir }}/main.py'],
    pathex=[
        r'{{ root_dir }}',
    ],
    binaries=[],
    datas=[
        (r'{{ root_dir }}/LICENSE.md', '.'),
        (r'{{ root_dir }}/CHANGELOG.md', '.'),
        (r'{{ root_dir }}/kanmail/client/icon.png', '.'),

        (r'{{ root_dir }}/kanmail/client/templates', 'templates'),

        # Generated at build time
        (r'{{ root_dir }}/dist/version.json', 'static/dist'),
        (r'{{ root_dir }}/dist/hidden.json', 'static/dist'),
        (r'{{ root_dir }}/dist/', 'static/dist/{{ version }}'),

        # TLD names
        (r'{{ tld_package_dir }}/res/effective_tld_names.dat.txt', 'tld/res'),
    ],
    hiddenimports=[
    {%- if platform_name == 'win' -%}  # noqa
        'win32timezone',
    {%- endif -%}  # noqa
    ],
    hookspath=[
        r'{{ pyupdater_package_dir }}/hooks',
    ],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
{% if platform_name != 'mac' %}  # noqa
    noarchive=False,
{% endif %}  # noqa
)


{% if platform_name == 'nix64' %}
# Fixup Linux builds
# Here we *remove* a lot of the shared libraries Pyinstaller picks up during the
# analysis. We only include the minimum number of libraries, and rely on the
# underlying system libraries elsewhere (ie GTK + Webkit). This improves portability
# and reduces the Linux build size significantly.

def _should_include_binary(binary_tuple):
    import fnmatch

    dest = binary_tuple[0]
    if dest.startswith('lib-dynload'):
        return True

    src = binary_tuple[1]
    if fnmatch.fnmatch(src, '*python*'):
        return True

    if not src.startswith('/lib') and not src.startswith('/usr/lib'):
        return True

    print('Skip bundling library: {0} -> {1}'.format(src, dest))
    return False

a.binaries = list(filter(_should_include_binary, a.binaries))
{% endif %}


# Generate the executable
#

pyz = PYZ(  # noqa: F821
    a.pure, a.zipped_data,
    cipher=None,
)

exe = EXE(  # noqa: F821
    pyz, a.scripts,

{% if platform_name == 'mac' or onedir %}  # noqa
    [],
    exclude_binaries=True,
{% elif platform_name in ('nix64', 'win') %}  # noqa
    a.binaries, a.zipfiles, a.datas, [],
{% endif %}  # noqa

    name='{{ platform_name }}',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,

{% if platform_name == 'mac' %}  # noqa
    console=False,
{% elif platform_name == 'nix64' %}  # noqa
    runtime_tmpdir=None,
    console=True,
{% elif platform_name == 'win' %}  # noqa
    runtime_tmpdir=None,
    console=False,
    icon=r'{{ root_dir }}/make/icon.ico',
{% endif %}  # noqa
)


# Generate the directory
#

coll = COLLECT(  # noqa: F821
    exe, a.binaries, a.zipfiles, a.datas,
    strip=False,
    upx=False,
    name='{{ platform_name }}',
)


# Build MacOS app bundle
#

{% if platform_name == 'mac' %}  # noqa
app = BUNDLE(  # noqa: F821
    coll,
    name='mac.app',
    icon=r'{{ root_dir }}/make/icon.icns',
    bundle_identifier=None,
    info_plist={
        # Provides retina support
        'NSHighResolutionCapable': 'True',
        # Set the app bundle version
        'CFBundleShortVersionString': '{{ version }}',
    },
)
{% endif %}  # noqa
