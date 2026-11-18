@echo off
cd /d "%~dp0"
start "" ".venv\Scripts\pythonw.exe" run.py examples/demo_schematic.json
