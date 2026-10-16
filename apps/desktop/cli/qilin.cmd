@echo off
setlocal DisableDelayedExpansion
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0..\..\..\..\QiLin Desktop.exe" --expose-internals "%~dp0..\..\..\app.asar\qilin\node_modules\@qilin-agent\desktop-host\lib\cli.js" %*
exit /b %errorlevel%
