@echo off
chcp 65001 >nul
rem 促融共竞：启动完整包的服务器（docs/deploy.md）。需要 Node.js 22.12 或更新的版本。
rem 参数传给服务器，例如 start-windows.bat --port 8800
setlocal
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo 没有找到 Node.js。请先安装 Node.js 22 或 24：https://nodejs.org/
  pause
  exit /b 1
)
node scripts\launch.js %*
if errorlevel 1 pause
