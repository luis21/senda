# Senda: cosmética nativa y panel por sitio

Fecha local: 2026-11-15, Windows x64. Chromium `156.0.8078.80`, revisión `fb096c0011f9d50f0a264a9376420cdea9c421e3`.

## Resultado

Compilación de desarrollo completada con cuatro tareas. Los parches 0005 y 0006 incorporan ocultación mediante CSS de usuario nativo, consultas por dominio/clase/identificador y controles de protección por sitio. No requieren una extensión ni JavaScript inyectado en las páginas.

El suplemento de documento agrupa y deduplica selectores; comprueba el filtro Bloom antes de convertir nombres ASCII. Mantiene vivo el propietario de la interfaz nativa y descarta tareas de documentos sustituidos. También observa nodos adoptados desde documentos inertes, incluidos fragmentos de `template`.

El panel reutiliza Views de Chromium. Muestra estado y solicitudes bloqueadas **al abrirlo**; no presenta ese número como elementos ocultos ni rastreadores identificados. El contador es por página e incluye solicitudes posteriores a la carga y avisos de trabajadores web. La acción propuesta cambia la excepción ADS del origen y recarga; vuelve a comprobar permisos y evita aplicar dos veces la misma elección.

## Instantánea atribuida

EasyList/EasyPrivacy, versiones UTC `202611160028`, opción de licencia CC-BY-SA-3.0. Las fuentes originales y sus licencias se conservan en `third_party/easylist/`.

- 106.891 reglas de URL convertidas, con los límites del motor nativo documentados en el informe de red.
- 23.845 reglas cosméticas analizadas; 23.533 preparadas para compilar y 312 omitidas por incompatibilidad.
- Se conservan 167 excepciones de activación cosmética: 183 dominios, dos prefijos de host y seis subcadenas de URL. Ninguna excepción actual necesita el fallback global.
- Restricciones de ruta/opciones pueden ampliarse conservadoramente al dominio. Un patrón de excepción desconocido suprime la categoría correspondiente antes que ocultar contenido incorrectamente.
- `UnindexedRules`: 5.349.888 bytes; SHA-256 `8b55a844533e1f3583ba206a9c94a5c9a2e8960936823fc4f053656495a0e6c4`.
- `CosmeticExceptions.inc`: 4.763 bytes; SHA-256 `a03d5bd96e5c8401f818d3b4ca4cca6d39d565af64fd6e87ac8fb6f916e66578`.

La validación comprueba ambos hashes antes de copiar archivos al checkout. La tabla de excepciones se compila en Blink: actualizar esta instantánea requiere preparación y compilación. No hay sustitución ni descarga automática de listas en ejecución.

## Verificaciones realizadas

| Caso | Resultado observado |
|---|---|
| Página controlada sin excepción | Recurso legítimo cargado; solicitudes de anuncio y rastreo bloqueadas sin llegar al servidor |
| CSS genérico | IDs, clases, cambios dinámicos, clones y nodos de `template` ocultos; contenido legítimo visible |
| Prioridad CSS | La ocultación nativa prevalece sobre `display:block!important` del sitio |
| Excepción de protección por sitio | Solicitudes permitidas y elementos visibles en el perfil preparado con ALLOW |
| Excepción cosmética de dominio | `dez.ro` y `sub.dez.ro` conservan el elemento exceptuado |
| Selector exclusivo de dominio | Se aplica en `anagram-solver.io` y no en los otros dominios de prueba |
| Excepciones de activación | Conservan contenido en localhost, familias de host, subdominios y URL con fragmento coincidente |
| Índice corrupto | Se recupera y vuelve a filtrar red y elementos en la primera página de prueba |
| Índice no disponible | Error explícito; cero solicitudes al servidor antes de detener la navegación |
| Privacidad inicial | Cookies de terceros bloqueadas, sugerencias desactivadas y Safe Browsing habilitado |
| Ahorro de memoria inicial | Estado 2, modo equilibrado 1 conservados |
| Panel nativo observado en Windows | Contador 2 → 3 tras solicitud tardía → 2 después de navegar; el panel anterior se cierra |
| Trabajador web y petición tardía | Bloqueados con servidor CORS permisivo; se evita confundir un fallo CORS con bloqueo del filtro |
| Reproducción de parches | Los seis parches se aplican a 48 archivos desde la revisión base y coinciden con las fuentes compiladas |

Pasaron 15 pruebas Python de preparación/integridad y la prueba Node del transporte CDP. Las pruebas de navegador terminaron con código 0, incluyendo recuperación y error de inicialización. Los perfiles y registros de ejecución están excluidos de Git.

Se observaron fallos RED antes de implementar la cosmética y antes de corregir los dos hallazgos de revisión: el nodo de `template` quedaba visible y la excepción de localhost se ignoraba. Los casos corregidos pasan en el navegador final. La revisión independiente posterior no encontró nuevos problemas importantes.

## Reproducción

Después de compilar los targets `chrome` y `ruleset_converter`, usar el Node incluido en el checkout o un Node compatible:

```powershell
node tests/network-protection-browser.mjs .profiles/cosmetic-check --cosmetic --cosmetic-activation --check-privacy
node tests/network-protection-browser.mjs .profiles/cosmetic-allow-check --cosmetic --allow-site
node tests/network-protection-browser.mjs .profiles/cosmetic-check --corrupt-index --cosmetic
node tests/network-protection-browser.mjs .profiles/cosmetic-unavailable-check --unavailable
node tests/memory-browser.mjs .profiles/memory-cosmetic-check --prefs-only
python -m unittest discover -s tests -p "test_*filter*.py"
node --test tests/cdp.test.mjs
```

Los perfiles de valores iniciales deben ser nuevos. `--corrupt-index` solo se usa sobre el perfil controlado ya generado. Nunca usar perfiles con datos personales.

Para observar el panel, ejecutar la prueba de red con `--headed --inspect-panel`. `tests/protection-panel-probe.mjs <perfil> late|worker|reset|empty|close` genera eventos controlados mientras el navegador permanece abierto. `--allow-site` en el probe cambia únicamente el resultado esperado. En esta sesión la herramienta de Windows distinguió correctamente una copia idéntica del ejecutable llamada `senda.exe`, seleccionada con `--senda-exe`.

## Límites pendientes

- La herramienta de Windows dejó de permitir interacción con el escritorio (`GetCursorPos: acceso denegado`). Se detuvo la automatización visual. Quedan pendientes revisar visualmente el estado desactivado/cero bloqueos y ejecutar la acción reversible desde el control.
- Se añadieron/ajustaron pruebas C++ para el contador, documentos anteriores, excepción reversible y disponibilidad del icono; las suites C++ completas no se compilaron ni ejecutaron. No se presentan como aprobadas.
- Las pruebas por perfiles preparados verifican la semántica de ALLOW/BLOCK; no sustituyen la prueba pendiente del clic de confirmación del panel.
- Los textos propios de este panel están inicialmente en español. Falta la integración completa de traducciones y la revisión de accesibilidad en todos los temas/escalados.
- No se afirma compatibilidad con toda la sintaxis de EasyList, ausencia de seguimiento ni ausencia de destellos antes del procesamiento agrupado. Falta ampliar pruebas con sitios reales, documentos complejos y Shadow DOM.
- No se repitió una comparación temporal de RAM para esta compilación; solo se comprobó la configuración. Las cifras del informe de memoria anterior no son una comparación nueva ni una comparación contra Chrome comercial.
- Siguen pendientes actualización automática de listas, modo estricto, auditoría completa de conexiones, extensiones representativas, instalador, firma y actualizaciones seguras del navegador.

Registros locales principales: `.tools/build-cosmetic.log`, `.tools/build-panel.log`, `.tools/cosmetic-final-{default,allowed,recovery,unavailable}.log`, `.tools/memory-cosmetic-prefs.log` y `.tools/native-patch-replay.json`.
