@echo off
REM 以调试模式启动 Chrome，独立数据目录，供 AI 通过 CDP(9222) 接管
set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
set DATADIR=%LOCALAPPDATA%\ChromeDebugProfile
start "" %CHROME% --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir="%DATADIR%" %*
echo Chrome 已以调试模式启动 (端口 9222)，数据目录: %DATADIR%
echo 首次使用请在这个窗口登录你的 Reddit / 其它账号。
