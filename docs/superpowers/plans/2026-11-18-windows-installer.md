# Windows Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, con un solo implementador. No pedir de nuevo autorización para crear el instalador solicitado por Luis.

**Goal:** Crear y verificar un instalador de Senda para Windows x64 independiente de Visual Studio.

**Architecture:** Compilación Release separada; manifiesto de dependencias GN validado; instalador NSIS por usuario con eliminación explícita de archivos propios.

**Tech Stack:** GN/Siso/Clang, PowerShell, Python estándar, NSIS Unicode 3.13, Node/CDP.

**Spec:** `docs/superpowers/specs/2026-11-18-windows-installer-design.md`.

**Cambio de alcance aprobado por Luis:** entregar primero el instalador personal Dev para su PC. `-PersonalDev` permite CRT Debug y marca el paquete como no redistribuible. La entrega Release independiente queda pendiente; no se utiliza una salida incompleta.

## Global Constraints

- Revisión Chromium y parches fijados; cuatro tareas; salidas Dev y Release separadas.
- NSIS 3.13 portátil, ZIP SHA-256 `ba63dffc4410ee89193e1cb5a41989991bd77c61068da17e3156d136b7b0b3d8`; copia Tauri contrastada con SHA-1 publicado `DB14F8AF2EA346B786C6AE19343F61AAF5E09B8E`.
- No CRT Debug en distribución; no perfiles, PDB ni credenciales; instalador sin firma, identificado como versión inicial.
- Instalación por usuario; no cambiar predeterminados, permisos ni configuración de seguridad de Windows.

## Review Focus

1. Rutas GN con `..`, enlaces o nombres que introduzcan instrucciones NSIS: rechazarlas antes de generar el paquete.
2. Sello válido pero binarios Debug: exigir Release y detectar DLL de depuración.
3. Desinstalador copiado a otro sitio o directorio con archivos ajenos: verificar identidad y borrar solo archivos declarados.
4. Instalación existente o archivos abiertos: abortar de forma clara, sin borrar perfiles ni matar navegadores ajenos.
5. Ejecutable que solo funciona en el checkout: probar desde el directorio instalado con perfil exclusivo.

### Task 1: Compilación Release y manifiesto de paquete

**Files:** `config/args.release.gn`, `tools/Build-Senda.ps1`, `tools/package_senda.py`, `tests/test_installer_package.py`.

**Interfaces:** `collect_payload(output_dir, runtime_deps, allow_debug=False)` devuelve rutas relativas y hashes. `validate_build(output_dir, project_root, allow_debug=False)` comprueba sello, revisión, parches y argumentos GN.

- [x] Añadir pruebas negativas de rutas externas, enlaces, archivos faltantes, símbolos, sello incompleto, CRT Debug y escape de `$`/comillas; observar RED.
- [x] Implementar validación y generación de manifiesto/includes NSIS; confirmar GREEN.
- [ ] Compilar `Build-Senda.ps1 -Configuration Release -Jobs 4`; vigilar espacio y no lanzar binarios incompletos.

### Task 2: Instalación, desinstalación y entrega

**Files:** `installer/Senda.nsi`, `tools/Build-SendaInstaller.ps1`, `tools/Test-SendaInstaller.ps1`, `tests/network-protection-browser.mjs`, `docs/validation/2026-11-18-installer.md`.

**Interfaces:** `Build-SendaInstaller.ps1` produce `dist/SendaSetup-<version>-win-x64.exe` y manifiesto SHA-256; `-TestMode` usa identidad de instalación aislada. `Test-SendaInstaller.ps1` comprueba instalación, lanzamiento y conservación de datos.

- [x] Crear script NSIS con marca de propiedad, comprobación de destino, accesos, registro de desinstalación y borrado explícito de archivos propios.
- [x] Generar el instalador personal solicitado y probar integridad de archivos, lanzamiento y bloqueo nativo desde el destino.
- [x] Probar desinstalación normal preservando perfil y archivo ajeno; comprobar que CRT Debug se carga localmente y no se depende del checkout/Visual Studio. En Release sigue pendiente exigir ausencia de CRT Debug.
- [x] Intentar la revisión independiente: el agente no arrancó por límite de uso; documentar esa limitación sin afirmar una revisión inexistente. Corregir el fallo LPAC encontrado en ejecución con regresión RED→GREEN y prueba completa del artefacto.
- [x] Documentar límites y entregar EXE/hashes personales; conservar binarios fuera de Git. Mantener la rama existente autorizada; no crear publicación ni PR no solicitado.
