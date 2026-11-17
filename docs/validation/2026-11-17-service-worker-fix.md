# Corrección de interceptación al reiniciar con extensiones

El caso de arranque con permiso DNR queda corregido en la compilación de desarrollo de Senda. La primera carga vuelve a recibir la respuesta del service worker, sin recargar ni demorar la navegación. También pasa la batería completa de extensiones en una ventana normal con navegación directa al arrancar.

## Causa y corrección

Chromium permite enviar un controlador detenido sin una conexión Mojo ligada, mediante `kAvoidBindingStoppedServiceWorkerClone`. El renderer confundía la ausencia de esa conexión con la ausencia de controlador y omitía la interceptación. Al crear el conector, otra actualización del controlador podía enviar de nuevo una conexión vacía; `UpdateController(null)` la interpretaba como pérdida de control.

Los registros temporales de la reproducción mostraron `mode=2` (controlado), `fetch=1` (manejador no omisible), `remote=0`, `connector=0`, `bypass=1` y `skip_service_worker=0`. La primera corrección recuperó `/app.mjs`, pero los siguientes fetch seguían cayendo a red. Esto permitió identificar también la ruta de actualización del controlador. `ServiceWorkerClient::OnExecutionReady()` vuelve a enviar su información al cliente.

El parche `0010-senda-stopped-service-worker.patch` permite crear el conector para un controlador válido aunque su conexión inicial esté vacía. Si ya existe un conector, restablece esa conexión mediante `EnsureControllerServiceWorker` antes de actualizarlo. Conserva las comprobaciones de modo controlado, manejador no omisible y respuestas sintéticas. No modifica el sandbox, los permisos de las extensiones ni las políticas de aislamiento.

La revisión independiente detectó que la reconexión debía acotarse también al manejador no omisible; esa condición está incluida. Los registros temporales se retiraron antes de la compilación final.

## Validación

| Comprobación con el binario corregido | Resultado |
| --- | --- |
| Extensión mínima DNR: instalación, arranque frío y recarga | PASS; respuesta del worker desde la primera carga |
| Batería completa en ventana normal, sin `--navigate-after-start` | PASS |
| Permisos efectivos, mensajes, almacenamiento y DNR reversible | PASS |
| Detener/reactivar worker, actualizar extensión y reiniciar navegador | PASS |
| Worker sin manejador fetch: respuesta 404 de la red, incluido reinicio | PASS; no se fuerza interceptación |
| Desregistrar worker y navegar a una página sin controlador | PASS; petición llega al servidor y DNR de la extensión sigue activo |
| Pruebas Node de estado del inicio y transporte CDP | 11/11 PASS |
| Reproducir serie de parches desde la revisión base y comparar fuentes | 10 parches, 75 archivos, PASS |

Compilación incremental final con cuatro tareas: **53,17 segundos**, dos pasos. Revisión de Chromium: `fb096c0011f9d50f0a264a9376420cdea9c421e3` (156.0.8078.80). El sello de compilación conserva los hashes de los diez parches. La compilación temporal de diagnóstico y los intentos intermedios no son el binario final validado.

La prueba negativa del worker sin fetch también pasó en Chrome for Testing. Los informes anteriores mantienen los FAIL de la referencia oficial y de Senda antes de la corrección; no se sustituyeron por resultados nuevos. [Resumen de evidencia](2026-11-17-service-worker-fix-results.json).

## Reproducción

Usar nombres de perfiles nuevos desde la raíz del repositorio:

```powershell
$node = '.chromium/src/third_party/node/win/node.exe'
& $node tests/compatibility-browser.mjs .profiles/compatibility-dnr-fixed-check --startup-probe --startup-case=dnr-permission-only
& $node tests/compatibility-browser.mjs .profiles/compatibility-no-fetch-fixed-check --startup-probe --startup-case=controller-without-fetch-handler
& $node tests/compatibility-browser.mjs .profiles/compatibility-full-fixed-check --headed
```

Los tres comandos deben terminar en PASS. El segundo espera deliberadamente la respuesta de red, porque ese worker no tiene manejador fetch. El tercero comprueba además la navegación sin controlador después de desregistrar el worker. No requiere la opción de navegación posterior al arranque que se utilizó para el diagnóstico.

## Alcance

Se verificó el binario nativo real y el caso reproducible, además de la revisión estática independiente. No se compiló ni ejecutó la batería completa `content_unittests` de Chromium. Esta corrección no demuestra compatibilidad con todas las extensiones de Chrome Web Store o todos los sitios. Se mantienen pendientes esas pruebas, la actualización automática de listas, la comparación de RAM con Chrome, el instalador y las actualizaciones seguras del navegador.
