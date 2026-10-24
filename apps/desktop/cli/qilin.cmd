@echo off
setlocal DisableDelayedExpansion
set "ELECTRON_RUN_AS_NODE=1"
if not defined QILIN_HOME set "QILIN_HOME=%USERPROFILE%\.ktoon"
"%~dp0..\..\..\..\KToon.exe" --expose-internals "%~dp0..\..\..\app.asar\qilin\node_modules\@qilin-agent\desktop-host\lib\cli.js" %*
exit /b %errorlevel%
