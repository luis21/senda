# Preparación local de Senda — 2026-10-31

## Verificado

- depot_tools descargado del repositorio oficial en `.tools/depot_tools`, revisión `a20039648c0de69d8156906b18052bd47e9bf230`.
- Inicialización mediante cmd terminada; gclient muestra su ayuda y finaliza con código 0.
- Python de depot_tools: 3.11.8.
- `gclient metrics --opt-out` termina con código 0 e informa que las métricas están desactivadas.
- Visual Studio Community 2026 Insiders 18.12; `vcvars64.bat` inicializa correctamente el entorno x64.
- Compilador y enlazador MSVC 14.52.37025 localizados mediante el entorno de Visual Studio.
- Compilador de recursos del SDK 10.0.28000.0 localizado; SDK instalado previamente identificado como 10.0.28000.2957.
- Última medición antes de preparar depot_tools: 137,2 GB libres en C:.

## Límites y siguiente comprobación

- Aún no se descargó el checkout de Chromium, no se generó GN ni se compiló el navegador.
- Inicializar Visual Studio no equivale a verificar su detección por el script de Chromium. Insiders necesita validación contra la revisión seleccionada.
- MFC 14.52 x64 está presente en `atlmfc/lib/spectre/x64`; la ruta normal `atlmfc/lib/x64/mfc140u.lib` está ausente. El entorno estándar de Visual Studio incluye la ruta normal, por lo que no debe darse por resuelta la vinculación MFC. Comprobar el requisito de la revisión antes de ajustar rutas o instalar componentes adicionales; no copiar bibliotecas entre directorios.
- Corrección posterior: la ruta real `C:/Users/Luis/Documents/ChatGPT/Senda` no contiene espacios. Se eligió `.chromium` dentro del proyecto para el checkout.
- No se modificó PATH global ni la configuración global de Git. depot_tools avisó de que no existe `.gitconfig` global; no impidió la inicialización.
- La ejecución dentro del sandbox encontró un bloqueo de caché de Python; al repetir la operación autorizada fuera del sandbox, gclient terminó correctamente.

## Preparación del código

- Revisión estable seleccionada desde ChromiumDash: 156.0.8078.80, commit `fb096c0011f9d50f0a264a9376420cdea9c421e3`.
- Instrucciones de compilación de ese commit descargadas y contrastadas con las herramientas locales.
- Se ejecutó `GetVisualStudioVersion()` y `DetectVisualStudioPath()` del `build/vs_toolchain.py` oficial, con `DEPOT_TOOLS_WIN_TOOLCHAIN=0`: devuelve 2026 y la instalación Insiders existente.
- Tras obtener los archivos principales se ejecutó además `build/toolchain/win/setup_toolchain.py` oficial para Windows x64 con salida correcta (código 0). Genera rutas de compilador, includes y bibliotecas. Esto verifica configuración; no demuestra todavía vinculación MFC ni compilación.
- Diagnóstico automatizado: todos los requisitos iniciales aprobados; RAM 16 GB identificada como aportada por el usuario. Espacio al iniciar descarga: 136,4 GB.
- Pruebas de herramientas locales: 15 correctas, 0 fallidas. Incluyen rechazo de recursos insuficientes, revisión no fijada, directorio ajeno, perfil de Chrome y sello antiguo tras fallo temprano.
- Revisión independiente identificó y permitió corregir aceptación de salida antigua y falta de instrucciones para depot_tools desde un clon limpio. La reanudación completa y fallos reales de GN/autoninja siguen pendientes de probar con el checkout disponible.
- Descarga inicial de Chromium en curso. No hay todavía una compilación ni funciones propias de Senda implementadas.
- Se encadenó un proceso de continuación que espera el código de salida de la preparación. Solo si es 0 ejecuta `Build-Senda.ps1 -Jobs 2`; registra etapa y errores en `docs/validation/build-status.json` y salida de compilación en `.tools/build-continuation.log`. No lanza automáticamente el navegador ni anuncia éxito sin comprobar la salida.
