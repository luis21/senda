# Compilar la base de Senda en Windows

Un checkout sin parches genera Chromium base. Los parches incorporan identidad Senda, página de inicio y una primera capa de bloqueo nativo de red. Consultar los informes de validación antes de considerar probada una salida. Las optimizaciones de memoria siguen pendientes.

## Preparación

Requisitos de la revisión fijada: Windows x64, NTFS, 100 GB libres antes de descargar, 8 GB de RAM como mínimo, Visual Studio 2026 con C++, ATL y MFC x64, SDK 10.0.28000.2270 o compatible y Debugging Tools >=10.0.26100.3323. Equipo de Luis: 16 GB según sus especificaciones. La RAM no se interpreta como medida automáticamente si CIM falla.

La ruta actual del proyecto **no contiene espacios**. `.chromium` contiene el checkout y `.tools/depot_tools` contiene las herramientas descargadas; ambos están excluidos de Git. No cambiar PATH global, política de ejecución global ni configuración global de Git.

Desde la raíz del proyecto, usar Windows PowerShell:

En un clon limpio, obtener primero depot_tools del repositorio oficial (Git para Windows debe estar instalado):

```powershell
git clone --depth 1 https://chromium.googlesource.com/chromium/tools/depot_tools.git .tools/depot_tools
cmd.exe /d /c .tools\depot_tools\gclient.bat help
cmd.exe /d /c .tools\depot_tools\gclient.bat metrics --opt-out
```

La inicialización descarga Python y las herramientas oficiales necesarias. La revisión usada para esta preparación fue `a20039648c0de69d8156906b18052bd47e9bf230`; los scripts desactivan autoactualización durante las operaciones para evitar cambiar herramientas a mitad del proceso. En otra instalación, registrar la revisión real con `git -C .tools/depot_tools rev-parse HEAD`.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/Test-SendaEnvironment.ps1 -InstalledMemoryGB 16 -AsJson
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/Initialize-SendaChromium.ps1 -InstalledMemoryGB 16
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/Build-Senda.ps1 -Jobs 4
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/Start-Senda.ps1
```

`ExecutionPolicy Bypass` se limita al proceso que ejecuta nuestros scripts. El inicializador rechaza directorios ajenos y revisiones diferentes. Puede reintentarse tras interrupción de la descarga sin borrar archivos. El mínimo de 100 GB se vuelve a comprobar; si una descarga parcial deja menos, inspeccionar el consumo y espacio restante antes de continuar, sin eludir el control automáticamente.

La versión y el commit exacto están en `config/chromium.json`. Se obtiene solo ese commit y después sus dependencias con `gclient sync --no-history --nohooks`. Los hooks descargan herramientas adicionales antes de GN. Luis autorizó cuatro tareas de compilación; el parámetro permite reducirlas si hay presión de memoria.

El lanzador admite perfiles solo dentro de `.profiles`, separado de Chrome. Una compilación fallida deja un sello incompleto que impide abrir una salida anterior como si fuese nueva. No usar este perfil con datos importantes: es una base de desarrollo.

## Pruebas de herramientas locales

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Pester -Script ./tests -EnableExit"
```

Estas pruebas validan herramientas de preparación y sus rechazos; no sustituyen compilar Chromium ni probar navegación real.

## Cambios de Senda sobre Chromium

Los parches se enumeran en `patches/series`. En un checkout recién descargado y sin cambios locales, aplicar cada uno en ese orden antes de compilar, desde la raíz del proyecto:

```powershell
foreach ($sendaPatch in Get-Content patches/series) {
  $sendaPatchFile = Join-Path (Get-Location) "patches/$sendaPatch"
  git -C .chromium/src apply --check $sendaPatchFile
  if ($LASTEXITCODE -ne 0) { throw "No se puede aplicar $sendaPatch; revisar si ya estaba aplicado o hay cambios locales." }
  git -C .chromium/src apply $sendaPatchFile
  if ($LASTEXITCODE -ne 0) { throw "Fallo al aplicar $sendaPatch" }
}
```

No volver a aplicarlos sobre este checkout ya modificado. `Initialize-SendaChromium.ps1` rechaza cambios locales al reanudar para evitar sobrescribirlos. La fuente de la página de inicio está en `ui/new-tab/`; el parche 0002 contiene su copia empaquetada para Chromium. Mantener ambas sincronizadas al editarla.

Pruebas de estado de la página: `node --test tests/new-tab-state.test.mjs`. Las pruebas de navegador `tests/new-tab-browser.mjs <perfil> <URL>` requieren una instancia de prueba con `--remote-debugging-port=0` y `DevToolsActivePort` ya creado; cierran esa instancia al terminar. Usar un perfil dedicado y mantener el puerto accesible solo desde la máquina local.

## Instantánea del bloqueo nativo

`Build-Senda.ps1` verifica SHA-256, formato, tamaño y licencia de `assets/filters/`, y copia sus archivos a `third_party/senda_filter_lists` del checkout antes de generar recursos. La instantánea está empaquetada en el navegador; no depende de una descarga al primer arranque. La generación manual desde las fuentes atribuidas se realiza con `python tools/prepare_filter_snapshot.py`, después de compilar el target `ruleset_converter`. Esta herramienta no descarga ni actualiza automáticamente las fuentes.

Pruebas aisladas: `python -m unittest discover -s tests -p "test_*filters*.py"` y `python -m unittest discover -s tests -p "test_filter_snapshot.py"`. Prueba del navegador: `node tests/network-protection-browser.mjs .profiles/protection-fresh --check-privacy`. Usar un perfil nuevo para verificar valores iniciales. `--allow-site` prepara una excepción explícita en un perfil de prueba nuevo; `--corrupt-index` corrompe únicamente el índice de un perfil de prueba previamente generado y comprueba su recuperación. No usar perfiles con datos personales.

## Memoria

El parche 0004 activa el ahorro en modo equilibrado (15 minutos); los modos moderado y máximo usan 60 y 5 minutos. En Windows desactiva dos cachés opcionales de procesos mediante valores de arranque que respetan opciones explícitas del usuario y tienen prioridad frente a experimentos de Chromium.

`node tests/memory-browser.mjs .profiles/memory-default-check --prefs-only` comprueba los ajustes en un perfil nuevo. La comparación temporal usa dos perfiles nuevos con `--aggressive --duration=360`, añadiendo `--control` a uno de ellos. Mide el árbol de procesos con `tools/Measure-SendaProcessTree.ps1`, sin adelantar el reloj ni forzar descartes. Se usan ventanas de prueba y un dispositivo de audio simulado. Resultados, comandos exactos y límites: `docs/validation/2026-11-15-memory.md`. No presentar esta comparación sintética de Senda activado/desactivado como una comparación contra Chrome comercial.

## Verificación pendiente

Visual Studio Insiders es reconocido por `build/vs_toolchain.py` oficial del commit fijado; `setup_toolchain.py` para Windows x64 también finalizó correctamente. Las bibliotecas MFC x64 solo están en `spectre/x64`; la ruta estándar que configura Visual Studio no las contiene. No copiar bibliotecas: observar GN/vinculación y resolver el requisito concreto si se utilizan.

Fuentes oficiales:
- https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Windows&num=1
- https://chromium.googlesource.com/chromium/src/+/fb096c0011f9d50f0a264a9376420cdea9c421e3/docs/windows_build_instructions.md
