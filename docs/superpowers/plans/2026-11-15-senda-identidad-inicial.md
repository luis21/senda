# Identidad inicial de Senda

Ejecución nativa autorizada por Luis al pedir continuar. Implementa el primer tramo del hito 2 del diseño aprobado; no requiere repetir la elección de arquitectura.

Objetivo: nombre visible Senda y directorio predeterminado de perfil separado de Chromium en Windows. No crear instalador ni registrar asociaciones en este tramo.

Archivos del checkout:
- `chrome/app/theme/chromium/BRANDING`: nombres de producto e instalador; conservar atribuciones originales.
- `chrome/app/chromium_strings.grd`: nombres largo y corto, recursos no traducibles.
- `chrome/install_static/chromium_install_modes.h`: `kProductPathName` pasa a Senda para aislar el perfil predeterminado. No registrar componentes COM ni modificar sus GUID sin diseñar la distribución completa.

Archivos del proyecto: `patches/0001-senda-development-branding.patch`, `patches/series` y evidencia en `docs/validation/2026-11-15-functional.md`.

Pasos:
- [x] Verificar pestañas, descarga de contenido controlado y persistencia del marcador y almacenamiento local tras reinicio.
- [x] Aplicar cambios acotados y exportar parche reproducible sobre el commit fijado.
- [x] Comprobar diff y compilación incremental con cuatro tareas.
- [x] Validar metadatos de producto y arranque de la compilación resultante. Ruta de perfil propio comprobada y título visible `Nueva pestaña - Senda` confirmado en Windows.

Decisiones: no cambiar nombre interno `chrome.exe`, motor, Safe Browsing ni avisos legales. Icono, colores, página de inicio y separación completa de registro Windows pertenecen a los siguientes tramos del hito 2. El producto sigue siendo una compilación de desarrollo.

Ejecución: parche exportado, comprobación inversa `git apply --reverse --check` correcta. Compilación incremental iniciada con cuatro tareas, registro `.tools/build-identity.log`, estado en `docs/validation/build-status.json`. Validación del nombre y perfil espera a que termine.
