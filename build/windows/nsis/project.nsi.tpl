Unicode true

!define INFO_PROJECTNAME "Kanmail"
!define INFO_COMPANYNAME "Oxygem LLP"
!define INFO_PRODUCTNAME "Kanmail"
!define INFO_PRODUCTVERSION "KANMAIL_APP_VERSION"
!define INFO_COPYRIGHT "© 2025, Oxygem LLP"

# Per-user so the app can replace its own exe when auto-updating
!define WAILS_INSTALL_SCOPE "user"

## Include the wails tools
####
!include "wails_tools.nsh"

# The version information for this two must consist of 4 parts
VIProductVersion "${INFO_PRODUCTVERSION}.0.0"
VIFileVersion    "${INFO_PRODUCTVERSION}.0.0"

VIAddVersionKey "CompanyName"     "${INFO_COMPANYNAME}"
VIAddVersionKey "FileDescription" "${INFO_PRODUCTNAME} Installer"
VIAddVersionKey "ProductVersion"  "${INFO_PRODUCTVERSION}"
VIAddVersionKey "FileVersion"     "${INFO_PRODUCTVERSION}"
VIAddVersionKey "LegalCopyright"  "${INFO_COPYRIGHT}"
VIAddVersionKey "ProductName"     "${INFO_PRODUCTNAME}"

# Enable HiDPI support. https://nsis.sourceforge.io/Reference/ManifestDPIAware
ManifestDPIAware true

!include "MUI.nsh"

!define MUI_ICON "..\icon.ico"
!define MUI_UNICON "..\icon.ico"
# !define MUI_WELCOMEFINISHPAGE_BITMAP "resources\leftimage.bmp" #Include this to add a bitmap on the left side of the Welcome Page. Must be a size of 164x314
!define MUI_FINISHPAGE_NOAUTOCLOSE # Wait on the INSTFILES page so the user can take a look into the details of the installation steps
!define MUI_ABORTWARNING # This will warn the user if they exit from the installer.

!insertmacro MUI_PAGE_WELCOME # Welcome to the installer page.
# !insertmacro MUI_PAGE_LICENSE "resources\eula.txt" # Adds a EULA page to the installer
!insertmacro MUI_PAGE_DIRECTORY # In which folder install page.
!insertmacro MUI_PAGE_INSTFILES # Installing page.
!insertmacro MUI_PAGE_FINISH # Finished installation page.

!insertmacro MUI_UNPAGE_INSTFILES # Uninstalling page

!insertmacro MUI_LANGUAGE "English" # Set the Language of the installer

## The following two statements can be used to sign the installer and the uninstaller. The path to the binaries are provided in %1
#!uninstfinalize 'signtool --file "%1"'
#!finalize 'signtool --file "%1"'

Name "${INFO_PRODUCTNAME}"
OutFile "..\..\..\bin\${INFO_PROJECTNAME}-installer.exe" # Name of the installer's file.
InstallDir "$LOCALAPPDATA\Programs\${INFO_PRODUCTNAME}" # Default installing folder.
ShowInstDetails show # This will always show the installation details.

# Older installers were per-machine, leaving Kanmail in Program Files where it can't update itself
Function .onInit
    SetRegView 64
    ReadRegStr $0 HKLM "${UNINST_KEY}" "UninstallString"
    ${If} $0 == ""
        Return
    ${EndIf}

    MessageBox MB_OKCANCEL|MB_ICONINFORMATION "Kanmail is currently installed for all users of this PC, which stops it updating itself. This installer will remove that copy and install Kanmail just for you. Your accounts and settings are kept.$\n$\nPlease close Kanmail, then click OK. Windows will ask for permission to remove the old copy." /SD IDOK IDOK removeMachineInstall
    Abort

    removeMachineInstall:
    StrCpy $0 $0 -1 1
    ClearErrors
    ExecShellWait "" "$0" "/S"
    ${If} ${Errors}
        MessageBox MB_OK|MB_ICONEXCLAMATION "The all-users copy of Kanmail wasn't removed. You can remove it later from Settings > Apps." /SD IDOK
    ${EndIf}
FunctionEnd

Section
    !insertmacro wails.setShellContext

    !insertmacro wails.webview2runtime

    SetOutPath $INSTDIR

    # A running exe can't be overwritten but can be renamed, as the app's own updater does
    Delete "$INSTDIR\${PRODUCT_EXECUTABLE}.old"
    Rename "$INSTDIR\${PRODUCT_EXECUTABLE}" "$INSTDIR\${PRODUCT_EXECUTABLE}.old"

    !insertmacro wails.files

    Delete "$INSTDIR\${PRODUCT_EXECUTABLE}.old"

    CreateShortcut "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"
    CreateShortCut "$DESKTOP\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"

    !insertmacro wails.associateFiles

    !insertmacro wails.writeUninstaller
SectionEnd

Section "uninstall"
    !insertmacro wails.setShellContext

    RMDir /r "$AppData\${PRODUCT_EXECUTABLE}" # Remove the WebView2 DataPath

    RMDir /r $INSTDIR

    Delete "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk"
    Delete "$DESKTOP\${INFO_PRODUCTNAME}.lnk"

    !insertmacro wails.unassociateFiles

    !insertmacro wails.deleteUninstaller
SectionEnd
