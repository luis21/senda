# Senda

Navegador de desarrollo para Windows x64 basado directamente en Chromium. Prioridades: diseño atractivo, privacidad, bloqueo integrado de anuncios/rastreadores, extensiones y menor consumo de memoria medido.

## Estado

La base de Chromium y la identidad inicial Senda están compiladas. La página de inicio incorpora búsqueda configurable, accesos editables y temas claro, oscuro y del sistema. Está integrada y probada una primera capa de bloqueo nativo de solicitudes con EasyList/EasyPrivacy, con excepciones por sitio y recuperación de índice corrupto. Los valores iniciales bloquean cookies de terceros y desactivan sugerencias de búsqueda; respetan preferencias explícitas y conservan Safe Browsing habilitado. Consultar `docs/validation/build-status.json` y los informes de `docs/validation/` para distinguir funciones probadas de trabajo pendiente.

El ahorro de memoria está activado inicialmente en modo equilibrado (15 minutos), con modos de 60 y 5 minutos y exclusiones nativas. Una comparación local de 14 páginas sintéticas confirmó menos memoria privada con el modo máximo, conservación de las pestañas protegidas y reactivación. No equivale a una comparación contra Chrome comercial. Evidencia y cifras: `docs/validation/2026-11-15-memory.md`.

Siguen pendientes el filtrado cosmético, el panel propio de protección, la actualización automática de listas, la comparación de memoria con Chrome y sitios reales, el instalador y las actualizaciones seguras del navegador. Esta versión no es una entrega pública terminada. Evidencia del bloqueo y sus límites: `docs/validation/2026-11-15-protection.md`.

## Abrir la compilación

Desde la raíz del proyecto, cuando la compilación esté aprobada:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/Start-Senda.ps1
```

Se abre una ventana visible con perfil de desarrollo dentro de `.profiles/senda-dev`. El nombre interno del ejecutable sigue siendo `chrome.exe`; sus metadatos y marca son Senda.

## Desarrollo

- Diseño aprobado: `docs/superpowers/specs/2026-10-31-senda-design.md`.
- Instrucciones de compilación y parches: `docs/build/windows.md`.
- Fuente de la página de inicio: `ui/new-tab/`.
- Cambios reproducibles sobre Chromium: `patches/series`.
- Registro de compilación de memoria: `.tools/build-memory.log`.

Los árboles de Chromium, herramientas descargadas y perfiles se excluyen del repositorio. Se mantienen las atribuciones de Chromium en los archivos de marca y código originales.
