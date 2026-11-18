# Senda

Navegador de desarrollo para Windows x64 basado directamente en Chromium. Prioridades: diseño atractivo, privacidad, bloqueo integrado de anuncios/rastreadores, extensiones y menor consumo de memoria medido.

## Estado

El inicio incorpora mosaicos para hasta 48 sitios, fondo de pliegues local y bienvenida/novedades con ocultación configurable. El icono propio de Senda está integrado en el ejecutable, los logotipos internos y Nueva pestaña. Evidencia: [validación del inicio y bienvenida](docs/validation/2026-11-16-speed-dial-welcome.md).

La base de Chromium y la identidad inicial Senda están compiladas. La página de inicio incorpora búsqueda configurable y accesos editables. La personalización ofrece temas claro, oscuro y del sistema, cinco paletas que cambian también la barra y las pestañas, fondos locales y distribución de accesos cómoda o compacta. Se verificaron vista previa reversible y persistencia al reiniciar; detalles en [validación de personalización](docs/validation/2026-11-16-personalization.md). Está integrada y probada una primera capa de bloqueo nativo de solicitudes con EasyList/EasyPrivacy, con excepciones por sitio y recuperación de índice corrupto. Los valores iniciales bloquean cookies de terceros y desactivan sugerencias de búsqueda; respetan preferencias explícitas y conservan Safe Browsing habilitado. Consultar `docs/validation/build-status.json` y los informes de `docs/validation/` para distinguir funciones probadas de trabajo pendiente.

El ahorro de memoria está activado inicialmente en modo equilibrado (15 minutos), con modos de 60 y 5 minutos y exclusiones nativas. Una comparación local de 14 páginas sintéticas confirmó menos memoria privada con el modo máximo, conservación de las pestañas protegidas y reactivación. No equivale a una comparación contra Chrome comercial. Evidencia y cifras: `docs/validation/2026-11-15-memory.md`.

El filtrado cosmético nativo oculta elementos mediante reglas por dominio, clase e identificador; también cubre cambios dinámicos y plantillas HTML. Se conservan las excepciones cosméticas de las listas. El panel de la barra muestra estado, solicitudes bloqueadas y un control para cambiar la excepción del sitio. Se verificaron sus estados activo/desactivado, contador cero, solicitudes tardías y de trabajadores web, y reinicio al navegar. Activar/desactivar desde el panel guarda el cambio y lo conserva al reiniciar el navegador. Evidencia y límites: `docs/validation/2026-11-15-cosmetic-protection.md` y `docs/validation/2026-11-16-protection-control.md`.

Se verificó una extensión Manifest V3 local: permisos efectivos, mensajes, almacenamiento, DNR reversible, reactivación, actualización y persistencia tras reiniciar. Se corrigió el fallo de interceptación del service worker al arrancar con una extensión DNR. La primera carga y la batería completa en una ventana normal ya pasan sin recargar ni retrasar la navegación. También se comprobaron los casos sin manejador fetch y sin controlador. [Corrección y evidencia](docs/validation/2026-11-17-service-worker-fix.md).

Se verificaron instalaciones reales de uBlock Origin Lite y Dark Reader desde Chrome Web Store: bloqueo independiente del nativo, estilos, permisos operativos y persistencia al reiniciar. La primera muestra de sitios cubre MDN, Wikipedia, el repositorio de Chromium en GitHub y reproducción WebM. También pasó Wikipedia con ambas extensiones en una ventana normal. [Resultados y límites](docs/validation/2026-11-17-store-and-sites.md).

Las listas se actualizan directamente desde EasyList/EasyPrivacy mientras Senda está abierto. El panel permite desactivar la búsqueda automática y buscar manualmente; muestra versiones y última comprobación. La conversión usa un proceso aislado temporal y conserva protección válida ante errores. Se verificaron actualización real, coherencia de pestañas abiertas, recuperación y desconexión del conversor. [Evidencia y límites](docs/validation/2026-11-17-filter-list-updates.md).

Siguen pendientes ampliar las pruebas de compatibilidad y extensiones, la comparación de memoria con Chrome y sitios reales, terminar el instalador Release en preparación y las actualizaciones seguras del ejecutable. Esta versión no es una entrega pública terminada.

## Abrir la compilación

Para crear el instalador personal de pruebas con la compilación Dev ya verificada:

```powershell
./tools/Build-SendaInstaller.ps1 -PersonalDev
```

Genera el `.exe`, SHA-256 y manifiesto en `dist/`. Usa dependencias Debug solo para pruebas en el equipo del propietario; no es redistribuible. Sin `-PersonalDev`, el comando exige una compilación Release completa. [Validación del instalador](docs/validation/2026-11-18-installer.md).

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
