@echo off
setlocal enabledelayedexpansion

:: ─── Config ───
set VPS_HOST=103.253.212.251
set VPS_USER=root
set BASE=/root/NaruHub/monitor/.deploy

:: Get short commit hash
for /f %%i in ('git rev-parse --short HEAD') do set RELEASE_ID=%%i

echo ═══ NaruHub Local Deploy (Windows) ═══
echo Release: %RELEASE_ID%
echo.

:: ─── Build ───
echo ▸ Building...
call npm run build
if errorlevel 1 (
    echo BUILD FAILED
    exit /b 1
)

echo ▸ Preparing standalone artifact...
if exist deploy-artifact rmdir /s /q deploy-artifact
mkdir deploy-artifact\standalone

xcopy /e /i /q .next\standalone deploy-artifact\standalone

if exist .next\static (
    mkdir deploy-artifact\standalone\.next\static
    xcopy /e /i /q .next\static deploy-artifact\standalone\.next\static
)

if exist public (
    mkdir deploy-artifact\standalone\public
    xcopy /e /i /q public deploy-artifact\standalone\public
)

:: ─── Archive (tar via Windows 10+ built-in) ───
echo ▸ Creating archive...
tar -czf naruhub-monitor.tar.gz -C deploy-artifact .

:: ─── Upload via SCP ───
echo ▸ Uploading to VPS...
scp naruhub-monitor.tar.gz %VPS_USER%@%VPS_HOST%:/tmp/naruhub-monitor-%RELEASE_ID%.tar.gz
if errorlevel 1 (
    echo UPLOAD FAILED - pastikan ssh key sudah di-setup atau pakai PuTTY pscp
    exit /b 1
)

:: ─── Deploy on VPS via SSH ───
echo ▸ Deploying on VPS...
ssh %VPS_USER%@%VPS_HOST% "RELEASE_ID='%RELEASE_ID%' BASE='%BASE%' bash -s" < deploy-remote.sh
if errorlevel 1 (
    echo DEPLOY FAILED
    exit /b 1
)

:: ─── Cleanup ───
rmdir /s /q deploy-artifact
del naruhub-monitor.tar.gz

echo.
echo ═══ Done ═══
