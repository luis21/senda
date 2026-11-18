# Instalador personal de Senda — 18 de noviembre de 2026

Luis eligió entregar primero un instalador de pruebas para su PC. Este paquete usa la compilación Dev verificada de Chromium 156.0.8078.80 y los 18 parches actuales, con dependencias de depuración para uso del propietario. No es una distribución Release ni un paquete para redistribuir. No dispone de firma digital.

## Construcción reproducible

```powershell
./tools/Build-SendaInstaller.ps1 -PersonalDev
```

Salida: `dist/SendaSetup-156.0.8078.80-win-x64-personal-dev.exe`, hash SHA-256 y manifiesto de archivos. El destino inicial es `%LOCALAPPDATA%\Programs\Senda-Dev`; se registra por usuario y crea un acceso en Inicio. El acceso de escritorio es opcional. No cambia el navegador predeterminado.

El empaquetador exige sello correcto, revisión y hashes de parches; obtiene la lista de ejecución de GN, normaliza y deduplica rutas, excluye perfiles y símbolos y rechaza rutas externas. La versión normal del comando exige Release y rechaza CRT Debug. Solo `-PersonalDev` admite el paquete personal solicitado. Se conservan `chrome.exe` y el alias idéntico `Senda.exe` por las rutas de procesos secundarios de Chromium, y se incluyen licencias de Senda, Chromium y listas.

NSIS Unicode 3.13 procede del espejo mantenido por Tauri, contrastado con su hash publicado. El bloque sólido de más de 2 GiB falló al mapear datos; se comprime por archivo. Para la entrega personal se usa zlib, después de comprobar en una muestra de 100 MiB una relación comprimida de 0,242 y unos 5 s; LZMA resultó demasiado lento para esta entrega. La ruta Release conserva LZMA por archivo con diccionario de 16 MiB. El paquete contiene 5.343 archivos / 3.601.673.233 bytes antes de comprimir.

## Evidencia

- Python: 13 pruebas aprobadas y una omitida porque el token Windows no puede crear symlinks. Incluye sello incompleto, parches alterados, Debug rechazado por defecto, rutas externas, símbolos, nombres Windows reservados y escape NSIS. Las uniones reales de Windows se prueban por separado.
- Node: 16 pruebas existentes aprobadas; el escenario del navegador admite una ruta explícita al ejecutable instalado.
- Prueba NSIS con contenido controlado: instalación y hashes, rechazo de carpeta ocupada, desinstalador trasladado, instalación a través de una unión, DLL abierta y conservación de archivo ajeno y perfil: aprobadas.
- Paquete completo definitivo: instalación de 5.343 archivos con todos sus hashes correctos; permiso LPAC heredado RX sin escritura; rechazo de carpeta ocupada, desinstalador trasladado, uniones al instalar/desinstalar y DLL abierta; arranque del navegador instalado; bloqueo de red y cosmético; desinstalación normal, incluido el propio desinstalador, conservando perfil y archivo ajeno: **PASS**, salida 0.

La primera prueba completa instaló y verificó los 5.343 hashes, pero el arranque detectó un fallo real de empaquetado: el nuevo directorio no heredaba lectura/ejecución para LPAC (`S-1-15-2-2`). Chromium rechazó el ejecutable en `SandboxWin::AddAppContainerProfileToConfig` y terminó con `0x80000003`. Su árbol de desarrollo sí tenía esa ACE. Se contrastó con `testing/scripts/common.py:set_lpac_acls` del Chromium fijado, que usa exactamente `icacls /grant *S-1-15-2-2:(OI)(CI)(RX)`.

El instalador crea la carpeta vacía, añade esa ACE heredable únicamente a la carpeta del programa antes de extraer los archivos y aborta si falla. Conserva las demás ACL, no añade escritura a LPAC ni modifica perfiles, antecesores o políticas de Windows; el sandbox continúa activo. La nueva regresión falló con el instalador anterior y pasó con el corregido. Tanto la reproducción como la instalación nueva desde el `.exe` definitivo aprobaron red, CSS, mutaciones y dominios, y observaron 592 módulos sin dependencias del checkout/Visual Studio y con CRT Debug local. El primer `.exe` se apartó de `dist` y no se entrega.

## Artefacto entregable

- Archivo: `dist/SendaSetup-156.0.8078.80-win-x64-personal-dev.exe`.
- Tamaño: **965.284.476 bytes** (920,6 MiB).
- SHA-256: `b46977f4434acb9d2e61c16cb355eca4be99090dd9b7d46bda20b1111f21ee06`.
- Manifiesto y archivo `.sha256` junto al ejecutable; los binarios permanecen fuera de Git.
- Perfil exclusivo validado: `.profiles/installer-validation-1795032584257`; módulos registrados en `runtime-modules.json`.
- Registro local: `.tools/senda-installer-validation-final.log`; compilación: `.tools/senda-personal-installer-acl-build.log`.
- No se instaló en la ubicación personal definitiva ni se modificaron perfiles existentes: la copia de prueba se desinstaló y eliminó su registro/acceso directo.

El desinstalador valida marca de producto y ubicación, comprueba enlaces en los antecesores y archivos en uso antes de borrar; elimina únicamente la lista de archivos propia y directorios vacíos. Conserva perfiles y archivos ajenos. La prueba usa un directorio exclusivo del proyecto y un perfil nuevo; no modifica perfiles de navegación personales.

La revisión independiente del instalador se intentó, pero el agente no arrancó por límite de uso del servicio. No se afirma que esa revisión haya ocurrido. Se mantienen comprobación directa del código y pruebas negativas reales.

## Pendiente de distribución general

Release permanece incompleta: se detectaron archivos generados nulos de Mojo y Rust tras la compilación interrumpida. Esa salida no se usa para este instalador. Quedan como alcance posterior una compilación Release completa, validación sin CRT Debug, firma y actualización del ejecutable.
