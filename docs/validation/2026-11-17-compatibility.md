# Compatibilidad de extensiones y plataforma web — 2026-11-17

Resultado parcial: las comprobaciones de la extensión pasan; la batería conjunta termina en **FAIL** por un caso de service worker web después de reiniciar. No se declara completada la compatibilidad general.

Navegador Senda existente: Chromium 156.0.8078.80, revisión `fb096c0011f9d50f0a264a9376420cdea9c421e3`, nueve parches verificados contra el sello de compilación. No se modificó ni recompiló el motor en esta revisión.

## Resultados

| Caso controlado | Resultado |
| --- | --- |
| Módulos, importación dinámica, WebAssembly, IndexedDB, CacheStorage, Canvas y CSS Grid | PASS |
| Service worker web sin extensión, incluido reinicio | PASS |
| Inyección del content script solo en el host autorizado | PASS |
| Mensajes y almacenamiento de la extensión | PASS |
| Lectura desde el worker a 127.0.0.1 autorizado; localhost sin permiso y sin CORS | PASS: primera legible y segunda rechazada; ambas verificadas con contadores del servidor |
| DNR bloquea, permite y vuelve a bloquear; contador del servidor distingue las solicitudes | PASS |
| Worker detenido y reactivado con otra identidad, conservando almacenamiento y reglas | PASS |
| Actualización local 1.0.0 → 1.1.0 por API nativa; evento de actualización y datos conservados | PASS |
| Reinicio normal: extensión 1.1.0, modo desarrollador, datos y reglas persistentes | PASS |
| Bloqueo nativo de Senda independiente de la extensión | PASS |
| Interceptación del service worker web tras reiniciar con la extensión | **FAIL** en Senda y Chrome for Testing |

En el último caso, el controlador web figura activado y responde mensajes, pero no recibe eventos fetch: `/sw-resource` devuelve el 404 del servidor en lugar de la respuesta sintética. También falla un segundo intento. El fallo persistió en pruebas diagnósticas sin reglas DNR; quitar el permiso DNR de la copia sintética permitió la interceptación. Son observaciones del escenario local, no una causa confirmada.

La referencia oficial Chrome for Testing 156.0.8078.80 reproduce el mismo fallo con el mismo comprobador, tanto cargando la extensión por argumento como restaurándola del perfil después de la actualización nativa. Esto impide atribuirlo exclusivamente a los parches de Senda. Falta aislar una reproducción mínima fuera de headless antes de decidir si se necesita un cambio del motor. Se conserva el FAIL y el código de salida 1.

Evidencia resumida de las tres ejecuciones finales: [JSON](2026-11-17-compatibility-results.json). No hubo errores ni advertencias de cierre en esas ejecuciones. Perfiles y registros completos locales: `.profiles/compatibility-final-web/`, `.profiles/compatibility-final-full/` y `.profiles/compatibility-final-reference/`; excluidos de Git.

## Reproducción

Desde la raíz del repositorio, con el navegador compilado y el sello actualizado por `tools/Build-Senda.ps1`:

```powershell
$node = '.chromium/src/third_party/node/win/node.exe'
& $node tests/compatibility-browser.mjs .profiles/compatibility-web-check --web-only
& $node tests/compatibility-browser.mjs .profiles/compatibility-full-check
```

Cada ruta debe ser nueva y un hijo directo de `.profiles` con nombre `compatibility-*`. Sin ruta se genera una nueva. El primer comando debe aprobar; el segundo reproduce el fallo abierto. El comprobador cierra su navegador y servidor tanto al aprobar como al fallar, guarda `report.json` por ejecución y copia el último informe a `.tools/compatibility-report.json`. No utilizar perfiles personales.

La extensión se copia antes de actualizarse. Se habilita el modo desarrollador únicamente en su perfil sintético mediante la API normal de `chrome://extensions`; no se editan preferencias protegidas ni se desactiva el sandbox. Las páginas, extensión y solicitudes de prueba usan loopback, incluida la resolución local del dominio publicitario de prueba. No se prueban cuentas ni permisos de cámara o micrófono.

Para la comparación se usó el [paquete oficial de Chrome for Testing](https://storage.googleapis.com/chrome-for-testing-public/156.0.8078.80/win64/chrome-win64.zip), con coincidencia del MD5 publicado por Google Storage y SHA256 registrados en el JSON. La opción `--reference` requiere esa copia local bajo `.tools/chrome-reference-156/chrome-win64/` y su metadata `.tools/chrome-reference-156.json`; comprueba versión, URL y SHA256 del ejecutable antes de lanzarlo. No descarga ni instala nada automáticamente.

## Límites y pendientes

Esta extensión propia sin empaquetar no demuestra instalación desde Chrome Web Store ni compatibilidad con extensiones comerciales. Tampoco cubre sitios reales completos, DRM, códecs licenciados, sincronización ni rendimiento comparativo. El siguiente paso de compatibilidad es reducir el caso service worker/DNR y contrastarlo en una ventana normal. Después se necesita una matriz de extensiones y sitios representativos.

Verificación adicional: 11 pruebas Node aprobadas y cinco pruebas Pester de compilación/lanzamiento aprobadas. El cambio de `Build-Senda.ps1` añade hashes de los parches al sello de futuras compilaciones; no se ejecutó una compilación nueva para ese cambio de metadata.

Referencias de las APIs probadas: [permisos de red](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests), [DNR](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) y [ciclo de vida del worker de extensión](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).
