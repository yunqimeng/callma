@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 node 命令。请先安装 Node.js LTS：https://nodejs.org/
  echo 安装后重新打开命令行窗口，再双击本文件。
  pause
  exit /b 1
)

echo ============================================
echo   点到 CALME · 课堂随机点名与积分系统
echo ============================================

if not exist "backend\node_modules" (
  echo [1/3] 安装后端依赖 ...
  pushd backend
  call npm install --no-audit --no-fund
  popd
) else (
  echo [1/3] 后端依赖已就绪
)

if not exist "frontend\dist\index.html" (
  echo [2/3] 安装前端依赖并构建 ...
  pushd frontend
  call npm install --no-audit --no-fund
  call npm run build
  if errorlevel 1 (
    echo [提示] Vite 构建失败，改用静态构建脚本 ...
    call node scripts\build-static.mjs
  )
  popd
) else (
  echo [2/3] 前端产物已就绪
)

echo [3/3] 启动服务：http://localhost:8000
start "" http://localhost:8000
pushd backend
call npm start
popd
pause
