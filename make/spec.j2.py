a = Analysis(  # noqa: F821
    ['{{ root_dir }}/main.py'],
    pathex=[
        '{{ root_dir }}',
    ],
    binaries=[
    {%- if platform_name == 'nix64' -%}  # noqa
        # Added/hidden
        ('/usr/lib/x86_64-linux-gnu/libicui18n.so.55', '.'),
        ('/usr/lib/x86_64-linux-gnu/libwebp.so.5', '.'),
        ('/usr/lib/x86_64-linux-gnu/libwebpdemux.so.1', '.'),

        ('/usr/lib/x86_64-linux-gnu/libgdk-3.so', '.'),
        ('/usr/lib/x86_64-linux-gnu/libgtk-3.so', '.'),
        # Needed?
        ('/usr/lib/x86_64-linux-gnu/libgirepository-1.0.so', '.'),
        ('/usr/lib/x86_64-linux-gnu/libwebkit2gtk-4.0.so.37', '.'),
        ('/usr/lib/x86_64-linux-gnu/libjavascriptcoregtk-4.0.so.18', '.'),

        ('/usr/lib/x86_64-linux-gnu/webkit2gtk-4.0', 'webkit2gtk-4.0'),
    {%- endif -%}  # noqa
    ],
    datas=[
        (r'{{ root_dir }}/LICENSE.md', '.'),
        (r'{{ root_dir }}/CHANGELOG.md', '.'),

        (r'{{ root_dir }}/kanmail/client/templates', 'templates'),

        # Generated at build time
        (r'{{ root_dir }}/dist/main.js', 'static/dist/{{ version }}'),
        (r'{{ root_dir }}/dist/version.json', 'static/dist'),

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
    icon='{{ root_dir }}/make/Kanmail.ico',
{% endif %}  # noqa
)

{% if platform_name == 'mac' or onedir %}  # noqa
coll = COLLECT(  # noqa: F821
    exe, a.binaries, a.zipfiles, a.datas,
    strip=False,
    upx=False,
    name='{{ platform_name }}',
)
{% endif %}  # noqa

{% if platform_name == 'mac' %}  # noqa
app = BUNDLE(  # noqa: F821
    coll,
    name='mac.app',
    icon='{{ root_dir }}/make/Kanmail.icns',
    bundle_identifier=None,
    info_plist={
        # Provides retina support
        'NSHighResolutionCapable': 'True',
        # Set the app bundle version
        'CFBundleShortVersionString': '{{ version }}',
    },
)
{% endif %}  # noqa
