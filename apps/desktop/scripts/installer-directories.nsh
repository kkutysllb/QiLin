!include "LogicLib.nsh"

Var qilinFinalDirectory
Var qilinNewDirectory
Var qilinOldDirectory
Var qilinOldMoved
Var qilinNewMoved

!macro qilinExtractPayload FILE
  !ifmacrodef customInstallerExtract
    !insertmacro customInstallerExtract "${FILE}"
  !else
    nsExec::ExecToStack '"$PLUGINSDIR\qilin-7za.exe" x -y -bd -bb0 "-o$INSTDIR" "${FILE}"'
    Pop $R0
    Pop $R1
  !endif
  ${If} $R0 != 0
    DetailPrint $R1
    Call qilinRollbackDirectories
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(decompressionFailed)" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!macro qilinStageApplication
  StrCpy $qilinFinalDirectory $INSTDIR
  System::Call 'ole32::CoCreateGuid(g .r0) i .r1'
  ${If} $1 != 0
    SetErrorLevel 2
    Quit
  ${EndIf}
  StrCpy $qilinNewDirectory "$INSTDIR.new-$0"
  StrCpy $qilinOldDirectory "$INSTDIR.old-$0"
  StrCpy $qilinOldMoved ""
  StrCpy $qilinNewMoved ""
  ClearErrors
  CreateDirectory $qilinNewDirectory
  ${If} ${Errors}
    SetErrorLevel 2
    Quit
  ${EndIf}
  File /oname=$PLUGINSDIR\qilin-7za.exe "${QILIN_SEVENZIP_PATH}"
  StrCpy $INSTDIR $qilinNewDirectory
  SetOutPath $INSTDIR
  !insertmacro installApplicationFiles
  !ifdef QILIN_SEVENZIP_LICENSE_DIR
    File /oname=7zip-installer-LICENSE.txt "${QILIN_SEVENZIP_LICENSE_DIR}\LICENSE.txt"
    File /oname=7zip-installer-COPYING.txt "${QILIN_SEVENZIP_LICENSE_DIR}\COPYING"
  !endif
  !ifdef UNINSTALLER_ICON
    File /oname=uninstallerIcon.ico "${UNINSTALLER_ICON}"
  !endif
  StrCpy $INSTDIR $qilinFinalDirectory
  SetOutPath $PLUGINSDIR
!macroend

Function .onGUIEnd
  Call qilinCleanupDirectories
FunctionEnd

Function qilinCleanupDirectories
  ${If} $qilinFinalDirectory != ""
    Call qilinRollbackDirectories
  ${EndIf}
FunctionEnd

; Only directories created or renamed by this installer are removed during rollback.
Function qilinRollbackDirectories
  SetOutPath $PLUGINSDIR
  ${If} $qilinNewMoved == "1"
    RMDir /r "\\?\$qilinFinalDirectory"
    StrCpy $qilinNewMoved ""
  ${EndIf}
  ${If} $qilinOldMoved == "1"
    ClearErrors
    Rename $qilinOldDirectory $qilinFinalDirectory
    ${If} ${Errors}
      ; Leave the complete backup in place if another process prevents restoration.
      DetailPrint $qilinOldDirectory
      Return
    ${EndIf}
    StrCpy $qilinOldMoved ""
  ${EndIf}
  ${If} $qilinNewDirectory != ""
    RMDir /r "\\?\$qilinNewDirectory"
  ${EndIf}
  StrCpy $INSTDIR $qilinFinalDirectory
FunctionEnd

Function qilinPromoteDirectories
  !ifmacrodef InstallerPublishStage
    !insertmacro InstallerPublishStage 2
  !endif
  ; SetOutPath opens a directory handle; release it before either rename.
  SetOutPath $PLUGINSDIR
  ClearErrors
  ${If} ${FileExists} "$qilinFinalDirectory\*.*"
    Rename $qilinFinalDirectory $qilinOldDirectory
    ${If} ${Errors}
      Call qilinRollbackDirectories
      SetErrors
      Return
    ${EndIf}
    StrCpy $qilinOldMoved "1"
  ${Else}
    ; NSIS can create the destination before the install section starts.
    RMDir $qilinFinalDirectory
  ${EndIf}
  ClearErrors
  Rename $qilinNewDirectory $qilinFinalDirectory
  ${If} ${Errors}
    Call qilinRollbackDirectories
    SetErrors
    Return
  ${EndIf}
  StrCpy $qilinNewMoved "1"
  SetOutPath $qilinFinalDirectory
  !ifmacrodef InstallerPublishStage
    !insertmacro InstallerPublishStage 3
  !endif
  ClearErrors
FunctionEnd

!macro qilinFinishDirectories
  StrCpy $qilinNewMoved ""
  ${If} $qilinOldMoved == "1"
    RMDir /r "\\?\$qilinOldDirectory"
    StrCpy $qilinOldMoved ""
  ${EndIf}
!macroend
