@echo off
setlocal DisableDelayedExpansion
set "signTool=%QILIN_DESKTOP_WINDOWS_SIGNTOOL%"
set "certificateFile=%QILIN_DESKTOP_WINDOWS_CER_FILE%"
set "tokenPin=%QILIN_DESKTOP_WINDOWS_TOKEN_PIN%"
set "keyContainer=%QILIN_DESKTOP_WINDOWS_KEY_CONTAINER%"
set "targetFile=%QILIN_DESKTOP_WINDOWS_SIGN_TARGET%"
set "appendSignature="
if "%QILIN_DESKTOP_WINDOWS_SIGN_APPEND%"=="1" set "appendSignature=/as"
set "QILIN_DESKTOP_WINDOWS_SIGNTOOL="
set "QILIN_DESKTOP_WINDOWS_CER_FILE="
set "QILIN_DESKTOP_WINDOWS_TOKEN_PIN="
set "QILIN_DESKTOP_WINDOWS_KEY_CONTAINER="
set "QILIN_DESKTOP_WINDOWS_SIGN_TARGET="
set "QILIN_DESKTOP_WINDOWS_SIGN_APPEND="
set "signTool=" & set "certificateFile=" & set "tokenPin=" & set "keyContainer=" & set "targetFile=" & set "appendSignature=" & "%signTool%" sign /v /fd sha256 /f "%certificateFile%" /kc "[{{%tokenPin%}}]=%keyContainer%" /csp "eToken Base Cryptographic Provider" %appendSignature% /tr http://timestamp.digicert.com /td sha256 "%targetFile%"
exit /b %errorlevel%
