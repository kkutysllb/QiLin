; Figma logical pixels, independent of the Windows display scale.
!define INSTALLER_WINDOW_SIZE 600
!define INSTALLER_BRAND_Y 174
!define INSTALLER_BRAND_HEIGHT 196
!define INSTALLER_BUTTON_X 240
!define INSTALLER_BUTTON_Y 490
!define INSTALLER_BUTTON_WIDTH 120
!define INSTALLER_BUTTON_HEIGHT 44
!define INSTALLER_BUTTON_DIAMETER 20
!define INSTALLER_PROGRESS_X 64
!define INSTALLER_PROGRESS_Y 482
!define INSTALLER_PROGRESS_WIDTH 472
!define INSTALLER_PROGRESS_HEIGHT 6
!define INSTALLER_PROGRESS_DIAMETER 4
!define INSTALLER_STATUS_Y 512
!define INSTALLER_STATUS_HEIGHT 22
!define INSTALLER_FONT "Microsoft YaHei UI"
!define INSTALLER_BUTTON_FONT_SIZE 16
!define INSTALLER_STATUS_FONT_SIZE 14
; Palette constants come from the shipped color pack via the generator; see
; apps/desktop/scripts/gen-desktop-theme.ts and its freshness gate.
!include "${INSTALLER_SOURCE_DIR}\theme.generated.nsh"

Var InstallerTheme
Var InstallerBgHex
Var InstallerTextHex
Var InstallerBgArgb
Var InstallerBgColorref
Var InstallerTextColorref
Var InstallerPrimary
Var InstallerPrimaryHover
Var InstallerPrimaryPressed
Var InstallerControlHover
Var InstallerTrack
Var InstallerButtonText
Var InstallerBorder

; SetCtlColors accepts only compile-time colors; choose between the two native palettes.
!macro InstallerControlColors HANDLE
    ${If} $InstallerTheme == "dark"
        SetCtlColors ${HANDLE} ${INSTALLER_DARK_TEXT_HEX} ${INSTALLER_DARK_BG_HEX}
    ${Else}
        SetCtlColors ${HANDLE} ${INSTALLER_LIGHT_TEXT_HEX} ${INSTALLER_LIGHT_BG_HEX}
    ${EndIf}
!macroend

Function InstallerResolveTheme
    ${If} $InstallerTheme == "auto"
        ClearErrors
        ReadRegDWORD $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Themes\Personalize" "AppsUseLightTheme"
        ${If} ${Errors}
            StrCpy $0 1
        ${EndIf}
        ${If} $0 == 0
            StrCpy $InstallerTheme "dark"
        ${Else}
            StrCpy $InstallerTheme "light"
        ${EndIf}
    ${EndIf}
    ${If} $InstallerTheme == "dark"
        StrCpy $InstallerBgHex "${INSTALLER_DARK_BG_HEX}"
        StrCpy $InstallerTextHex "${INSTALLER_DARK_TEXT_HEX}"
        StrCpy $InstallerBgArgb ${INSTALLER_DARK_BG_ARGB}
        StrCpy $InstallerBgColorref ${INSTALLER_DARK_BG_COLORREF}
        StrCpy $InstallerTextColorref ${INSTALLER_DARK_TEXT_COLORREF}
        StrCpy $InstallerPrimary ${INSTALLER_DARK_PRIMARY_ARGB}
        StrCpy $InstallerPrimaryHover ${INSTALLER_DARK_PRIMARY_HOVER_ARGB}
        StrCpy $InstallerPrimaryPressed ${INSTALLER_DARK_PRIMARY_PRESSED_ARGB}
        StrCpy $InstallerControlHover ${INSTALLER_DARK_CONTROL_HOVER_ARGB}
        StrCpy $InstallerTrack ${INSTALLER_DARK_TRACK_ARGB}
        StrCpy $InstallerButtonText ${INSTALLER_DARK_BUTTON_TEXT_COLORREF}
        StrCpy $InstallerBorder ${INSTALLER_DARK_BORDER_ARGB}
    ${Else}
        StrCpy $InstallerBgHex "${INSTALLER_LIGHT_BG_HEX}"
        StrCpy $InstallerTextHex "${INSTALLER_LIGHT_TEXT_HEX}"
        StrCpy $InstallerBgArgb ${INSTALLER_LIGHT_BG_ARGB}
        StrCpy $InstallerBgColorref ${INSTALLER_LIGHT_BG_COLORREF}
        StrCpy $InstallerTextColorref ${INSTALLER_LIGHT_TEXT_COLORREF}
        StrCpy $InstallerPrimary ${INSTALLER_LIGHT_PRIMARY_ARGB}
        StrCpy $InstallerPrimaryHover ${INSTALLER_LIGHT_PRIMARY_HOVER_ARGB}
        StrCpy $InstallerPrimaryPressed ${INSTALLER_LIGHT_PRIMARY_PRESSED_ARGB}
        StrCpy $InstallerControlHover ${INSTALLER_LIGHT_CONTROL_HOVER_ARGB}
        StrCpy $InstallerTrack ${INSTALLER_LIGHT_TRACK_ARGB}
        StrCpy $InstallerButtonText ${INSTALLER_LIGHT_BUTTON_TEXT_COLORREF}
        StrCpy $InstallerBorder ${INSTALLER_LIGHT_BORDER_ARGB}
    ${EndIf}
FunctionEnd
