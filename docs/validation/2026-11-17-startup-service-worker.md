# Service worker y extensiones durante el arranque

**Actualización posterior:** el caso se corrigió y verificó en Senda; consultar la [corrección y evidencia final](2026-11-17-service-worker-fix.md). Este documento conserva el diagnóstico anterior a la corrección.

Continuación de la [primera revisión de compatibilidad](2026-11-17-compatibility.md). En esta etapa el defecto seguía abierto; la revisión redujo el escenario y diferenció la navegación inicial de la navegación posterior al arranque. Todavía no se había modificado ni recompilado el motor.

## Hallazgos comprobados

- Senda reproduce el fallo en una ventana normal: no depende exclusivamente de headless.
- Basta una extensión Manifest V3 cuyo único permiso sea `declarativeNetRequest`. No necesita background, content scripts, permisos de host ni reglas de bloqueo.
- Sin extensión o con una extensión vacía sin ese permiso, la interceptación pasa tras reiniciar.
- En el caso afectado, la primera navegación solicitada al arrancar devuelve el 404 del servidor para `/sw-resource`. Recargar la página devuelve la respuesta correcta del worker.
- Abrir `about:blank` al arrancar y navegar después mediante `Page.navigate` permite la interceptación. El comprobador no añade esperas artificiales ni cambia preferencias de seguridad.
- La batería completa de extensiones de Senda pasa en una ventana normal con ese último recorrido: instalación, permisos, mensajes, almacenamiento, DNR reversible, reactivación del worker, actualización y reinicio.

Los resultados acotan el fallo a la interacción del arranque y la navegación inicial con una extensión que declara DNR. **No identifican todavía la instrucción o el componente del motor que lo causa.** Navegar después del arranque es un control diagnóstico; no se ha añadido como solución al navegador ni se presenta como corrección del defecto.

## Reproducción automatizada

Con una compilación verificada y desde la raíz del repositorio:

```powershell
$node = '.chromium/src/third_party/node/win/node.exe'
# Matriz reducida en una ventana normal; conserva FAIL si algún caso falla.
& $node tests/compatibility-browser.mjs .profiles/compatibility-startup-check --headed --startup-probe

# Solo el caso afectado, para evitar repetir los controles ya comprobados.
& $node tests/compatibility-browser.mjs .profiles/compatibility-startup-dnr-check --headed --startup-probe --startup-case=dnr-permission-only

# Batería completa de extensiones navegando después del arranque.
& $node tests/compatibility-browser.mjs .profiles/compatibility-post-start-check --headed --navigate-after-start
```

Cada ruta debe ser nueva. `--startup-probe` genera las extensiones mínimas en su propio directorio y prueba perfiles distintos para cuatro casos: sin extensión, extensión vacía, permiso DNR y permiso DNR con navegación posterior. Comprueba una primera sesión, reinicio y recarga. El caso afectado se registra antes de recargar; la recuperación no borra el fallo ni convierte el resultado conjunto en PASS.

Añadir `--reference` ejecuta el mismo comprobador con la copia oficial de Chrome for Testing 156.0.8078.80 verificada en la revisión anterior. La matriz de referencia también reproduce el defecto y la recuperación por recarga.

La extensión mínima equivale a este manifiesto, sin otros archivos:

```json
{"manifest_version":3,"name":"Senda startup probe","version":"1.0.0","permissions":["declarativeNetRequest"]}
```

El worker de la página responde con `local-service-worker` a `/sw-resource`; el servidor responde 404 a esa ruta. La comprobación no puede aprobar por una respuesta accidental del servidor. Mantiene las comprobaciones web de módulos, IndexedDB, CacheStorage, WebAssembly, Canvas y CSS Grid, además del bloqueo nativo de Senda.

## Evidencia y límites

Los informes completos se conservan localmente bajo `.profiles/`, fuera de Git. El [resumen JSON](2026-11-17-startup-service-worker-results.json) registra las ejecuciones seleccionadas, sus estados y los controles. Se ejecutaron además las 11 pruebas Node de estado de inicio y transporte CDP: todas aprobadas.

Una primera matriz de Senda agotó el plazo esperando que terminara la página en la sesión nueva con DNR, antes del caso de reinicio. Ese aborto se conserva en la evidencia: no se considera aprobado ni se oculta mediante reintentos sobre el mismo perfil. La repetición usa un perfil nuevo. No está confirmado si ese agotamiento comparte causa con el fallo de interceptación.

El paso pendiente es localizar la causa interna y validar una corrección manteniendo el caso de navegación inicial. Todavía faltan pruebas con extensiones distribuidas por Chrome Web Store y sitios reales. No se han enviado informes ni publicado cambios en Chromium.

La [documentación de DNR](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) distingue las solicitudes de red de las respuestas producidas por el propio worker; la extensión mínima no instala reglas. Esto sustenta el control, pero no demuestra por sí solo una causa del defecto.
