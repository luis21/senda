Unicode true
RequestExecutionLevel user
ManifestDPIAware true
!include MUI2.nsh
!include LogicLib.nsh
!include x64.nsh
!include WinVer.nsh
!include FileFunc.nsh

!ifndef PRODUCT_VERSION
  !error "PRODUCT_VERSION is required"
!endif
!ifndef GENERATED
  !error "GENERATED payload directory is required"
!endif
!ifdef TEST_MODE
  !define PRODUCT_ID "Senda.InstallerValidation"
  !define PRODUCT_TITLE "Senda (validacion del instalador)"
!else
  !ifdef PERSONAL_DEV
    !define PRODUCT_ID "Senda.PersonalDev"
    !define PRODUCT_TITLE "Senda (pruebas para este equipo)"
  !else
    !define PRODUCT_ID "Senda.Alpha"
    !define PRODUCT_TITLE "Senda"
  !endif
!endif
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_ID}"
Name "${PRODUCT_TITLE}"
OutFile "${OUTPUT_FILE}"
!ifdef PERSONAL_DEV
  InstallDir "$LOCALAPPDATA\Programs\Senda-Dev"
!else
  InstallDir "$LOCALAPPDATA\Programs\Senda"
!endif
; Compress files individually: Debug's complete runtime exceeds 2 GiB unpacked.
; NSIS's solid-data mapping cannot handle that block in this compiler build.
!ifdef PERSONAL_DEV
  SetCompressor zlib
!else
  SetCompressor lzma
  SetCompressorDictSize 16
!endif
SetDatablockOptimize off
ShowInstDetails show
ShowUninstDetails show
Icon "${PROJECT_ROOT}\assets\branding\senda.ico"
UninstallIcon "${PROJECT_ROOT}\assets\branding\senda.ico"
VIProductVersion "${PRODUCT_VERSION}"
VIAddVersionKey /LANG=1034 "ProductName" "Senda"
VIAddVersionKey /LANG=1034 "FileDescription" "Instalador de Senda para Windows x64 (alfa)"
VIAddVersionKey /LANG=1034 "FileVersion" "${PRODUCT_VERSION}"
VIAddVersionKey /LANG=1034 "LegalCopyright" "Senda contributors; Chromium authors"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Spanish"

Var CheckPath
Var FindHandle
Var FindName

; Refuse junctions/symlinks in every existing ancestor, including on uninstall.
!macro DefinePathCheck Prefix
Function ${Prefix}CheckSafePath
  Exch $CheckPath
  Push $0
  Push $1
  System::Call 'kernel32::GetFullPathNameW(w "$CheckPath", i ${NSIS_MAX_STRLEN}, w .r0, p 0) i .r1'
  ${If} $1 == 0
  ${OrIf} $1 >= ${NSIS_MAX_STRLEN}
    SetErrorLevel 3
    Quit
  ${EndIf}
  path_loop:
    System::Call 'kernel32::GetFileAttributesW(w r0) i .r1'
    ${If} $1 != -1
      IntOp $1 $1 & 0x400
      ${If} $1 != 0
        MessageBox MB_ICONSTOP "El destino contiene un enlace o punto de union. Elige una carpeta normal." /SD IDOK
        SetErrorLevel 3
        Quit
      ${EndIf}
    ${EndIf}
    ${GetParent} "$0" $1
    StrCmp $1 "" path_done
    StrCmp $1 $0 path_done
    StrCpy $0 $1
    Goto path_loop
  path_done:
  Pop $1
  Pop $0
  Pop $CheckPath
FunctionEnd
!macroend
!insertmacro DefinePathCheck ""
!insertmacro DefinePathCheck "un."

Function .onInit
  SetShellVarContext current
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Senda requiere Windows de 64 bits." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "Senda requiere Windows 10 o posterior." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
FunctionEnd

Function ValidateEmptyDestination
  System::Call 'kernel32::GetFullPathNameW(w "$INSTDIR", i ${NSIS_MAX_STRLEN}, w .r0, p 0) i .r1'
  ${If} $1 == 0
  ${OrIf} $1 >= ${NSIS_MAX_STRLEN}
    SetErrorLevel 3
    Quit
  ${EndIf}
  StrCpy $INSTDIR $0
  Push "$INSTDIR"
  Call CheckSafePath
  FindFirst $FindHandle $FindName "$INSTDIR\*.*"
  ${IfNot} ${Errors}
    destination_next:
    StrCmp $FindName "." destination_continue
    StrCmp $FindName ".." destination_continue
    StrCmp $FindName "" destination_done
    FindClose $FindHandle
    MessageBox MB_ICONSTOP "La carpeta ya contiene archivos. Elige una carpeta vacia o desinstala primero Senda; tus perfiles se conservaran." /SD IDOK
    SetErrorLevel 4
    Quit
    destination_continue:
    FindNext $FindHandle $FindName
    IfErrors destination_done destination_next
    destination_done:
    FindClose $FindHandle
  ${EndIf}
  ClearErrors
FunctionEnd

Section "Senda (obligatorio)" SEC_MAIN
  SectionIn RO
  Call ValidateEmptyDestination
  CreateDirectory "$INSTDIR"
  IfErrors install_failed
  ; Same minimum access used by Chromium's set_lpac_acls: RX only, inherited
  ; by this program's files. Keep the sandbox enabled; never grant write access.
  nsExec::ExecToStack /TIMEOUT=30000 '"$SYSDIR\icacls.exe" "$INSTDIR" /grant "*S-1-15-2-2:(OI)(CI)(RX)"'
  Pop $0
  Pop $1
  ${If} $0 != 0
    Goto install_failed
  ${EndIf}
  SetOverwrite off
  ClearErrors
  !include "${GENERATED}\payload-install.nsh"
  SetOutPath "$INSTDIR"
  File "${GENERATED}\package-manifest.json"
  IfErrors install_failed
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteINIStr "$INSTDIR\.senda-install.ini" "Senda" "Product" "${PRODUCT_ID}"
  WriteINIStr "$INSTDIR\.senda-install.ini" "Senda" "Directory" "$INSTDIR"
  IfErrors install_failed
  !ifndef TEST_MODE
    CreateShortcut "$SMPROGRAMS\${PRODUCT_TITLE}.lnk" "$INSTDIR\Senda.exe"
  !endif
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${PRODUCT_TITLE}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "Senda"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\Senda.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '$\"$INSTDIR\Uninstall.exe$\" /S'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
  Goto install_done
  install_failed:
    MessageBox MB_ICONSTOP "No se pudo completar la instalacion. Comprueba espacio y permisos. No se han modificado tus perfiles." /SD IDOK
    SetErrorLevel 5
    Abort
  install_done:
SectionEnd

!ifndef TEST_MODE
Section /o "Acceso directo en el escritorio" SEC_DESKTOP
  CreateShortcut "$DESKTOP\${PRODUCT_TITLE}.lnk" "$INSTDIR\Senda.exe"
SectionEnd
!endif

!macro CheckUnlocked File
  Push "${File}"
  Call un.CheckSafePath
  ${If} ${FileExists} "${File}"
    System::Call 'kernel32::CreateFileW(w "${File}", i 0x40000000, i 0, p 0, i 3, i 0x80, p 0) p .r0'
    ${If} $0 == -1
      MessageBox MB_ICONSTOP "Cierra Senda y los procesos que esten usando sus archivos antes de desinstalar." /SD IDOK
      SetErrorLevel 5
      Quit
    ${EndIf}
    System::Call 'kernel32::CloseHandle(p r0)'
  ${EndIf}
!macroend

Function un.onInit
  SetShellVarContext current
  Push "$INSTDIR"
  Call un.CheckSafePath
  ReadINIStr $0 "$INSTDIR\.senda-install.ini" "Senda" "Product"
  ReadINIStr $1 "$INSTDIR\.senda-install.ini" "Senda" "Directory"
  ${If} $0 != "${PRODUCT_ID}"
  ${OrIf} $1 != $INSTDIR
    MessageBox MB_ICONSTOP "No se reconoce esta instalacion de Senda. No se borrara ningun archivo." /SD IDOK
    SetErrorLevel 3
    Quit
  ${EndIf}
  !include "${GENERATED}\payload-locks.nsh"
FunctionEnd

Section "Uninstall"
  !include "${GENERATED}\payload-remove.nsh"
  Delete "$INSTDIR\package-manifest.json"
  Delete "$INSTDIR\.senda-install.ini"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  ReadRegStr $0 HKCU "${UNINSTALL_KEY}" "InstallLocation"
  ${If} $0 == $INSTDIR
    DeleteRegKey HKCU "${UNINSTALL_KEY}"
    !ifndef TEST_MODE
      Delete "$SMPROGRAMS\${PRODUCT_TITLE}.lnk"
      Delete "$DESKTOP\${PRODUCT_TITLE}.lnk"
    !endif
  ${EndIf}
  ; User profiles and unrelated files are deliberately outside the deletion list.
SectionEnd
