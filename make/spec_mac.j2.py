a = Analysis(  # noqa: F821
    ['{{ root_dir }}/main.py'],
    pathex=[
        '{{ root_dir }}',
        '{{ root_dir }}/.pyupdater/spec',
    ],
    binaries=[],
    datas=[
        ('{{ root_dir }}/LICENSE.md', ''),
        ('{{ root_dir }}/CHANGELOG.md', ''),

        ('{{ root_dir }}/kanmail/client/static', 'static'),
        ('{{ root_dir }}/kanmail/client/templates', 'templates'),

        # Generated at build time
        ('{{ root_dir }}/dist/main.js', 'static/dist'),
        ('{{ root_dir }}/dist/version.json', 'static/dist'),
    ],
    hiddenimports=[],
    hookspath=[
        '{{ pyupdater_package_dir }}/hooks',
    ],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
)

pyz = PYZ(  # noqa: F821
    a.pure, a.zipped_data,
    cipher=None,
)

exe = EXE(  # noqa: F821
    pyz, a.scripts,
    exclude_binaries=True,
    name='mac',
    debug=False,
    strip=False,
    upx=True,
    console=False,
    icon='{{ root_dir }}/make/Kanmail.icns',
)

coll = COLLECT(  # noqa: F821
    exe, a.binaries, a.zipfiles, a.datas,
    strip=False,
    upx=True,
    name='mac',
)

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
