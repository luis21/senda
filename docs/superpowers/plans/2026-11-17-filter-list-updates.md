# Protection List Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Luis prefiere un solo agente; no delegar la implementación.

**Goal:** Actualizar EasyList y EasyPrivacy desde sus fuentes oficiales sin recompilar Senda y conservando protección válida ante fallos.

**Architecture:** Un coordinador del proceso principal descarga dos fuentes fijas y convierte candidatos en un servicio nativo con sandbox. Red, CSS y excepciones se indexan y publican como una generación única. Una caché inmutable conserva la generación activa y la anterior, con recuperación mediante la copia incluida.

**Tech Stack:** Chromium 156.0.8078.80, C++/Mojo, Network Service, protobuf/FlatBuffers, Views, Python para generación de recursos durante el desarrollo, Node/CDP para integración.

**Spec:** `docs/superpowers/specs/2026-11-17-filter-list-updates-design.md`.

## Global Constraints

- Windows x64; revisión Chromium `fb096c0011f9d50f0a264a9376420cdea9c421e3`; compilación con cuatro tareas.
- Fuentes fijas: `https://easylist.to/easylist/easylist.txt` y `https://easylist.to/easylist/easyprivacy.txt`.
- Actualización automática activada inicialmente. Comprobación diaria mientras Senda esté abierto, diferida al terminar el arranque.
- Descargas secuenciales, máximo 20 MiB descomprimidos por fuente, 60 segundos por solicitud, hasta 1 millón de líneas por fuente y 64 KiB por línea. Máximo 20 MiB de reglas sin indexar.
- Reintentos al cabo de 1 hora, 6 horas y después 24 horas; el botón manual funciona con automático desactivado.
- Mantener TLS, sandbox, Safe Browsing, excepciones por sitio, licencia y atribución. No cookies, credenciales, referente ni identificadores añadidos; no telemetría nueva.
- No recargar pestañas automáticamente, no ejecutar herramientas externas ni código descargado, no dejar un proceso de conversión en reposo.
- SHA-256 es integridad local; HTTPS autentica el origen. No prometer firmas del editor ni reducción de RAM sin medir.
- Cambios reproducibles: modificar el checkout ignorado para compilar y exportar parches incrementales `0011` en adelante en `patches/series`. No incluir artefactos, perfiles ni registros grandes en Git.

## Review Focus

1. Actualización que solo cambia excepciones: debe cambiar el identificador y la generación activa (tareas 1 y 4).
2. Disco lleno o cierre entre publicación y puntero persistente: próximo arranque conserva una generación válida (tareas 3 y 4).
3. Respuesta 304 tras pérdida de caché: repetir sin condiciones; nunca activar datos faltantes (tarea 4).
4. Dos perfiles o clics simultáneos: una operación global, sin mezclar excepciones de sitios ni duplicar descargas (tareas 4 y 5).
5. Windows conserva archivos mapeados y el renderer de una pestaña antigua: aplazar limpieza y mantener su generación coherente (tareas 3 y 6).

## Mapa de archivos

Las rutas siguientes que empiezan por `components/`, `chrome/` o `third_party/blink/` son relativas a `.chromium/src/`; las restantes son relativas al repositorio Senda. Crear archivos pequeños por responsabilidad y sus entradas GN junto al módulo propietario.

- Formato y lectura: `components/url_pattern_index/proto/rules.proto`; `components/subresource_filter/core/common/{unindexed_ruleset,indexed_ruleset,document_subresource_filter}.{h,cc}`; `core/common/flat/indexed_ruleset.fbs`; nuevos `core/common/cosmetic_exceptions.{h,cc}`.
- Transmisión de estado al documento: `components/subresource_filter/content/renderer/web_document_subresource_filter_impl.{h,cc}`; `third_party/blink/public/platform/web_document_subresource_filter.h`; `third_party/blink/renderer/core/loader/senda_cosmetic_filter.cc`.
- Conversor: nuevos `components/subresource_filter/tools/rule_parser/senda_filter_compiler.{h,cc}`; `components/subresource_filter/content/mojom/senda_filter_compiler.mojom`; nuevos `components/subresource_filter/content/utility/senda_filter_compiler_impl.{h,cc}`; registro en `chrome/utility/services.cc` y dependencias GN de utilidad.
- Persistencia: nuevos `chrome/browser/subresource_filter/senda_filter_store.{h,cc}` y pruebas.
- Coordinación: nuevos `chrome/browser/subresource_filter/senda_filter_updater.{h,cc}` y pruebas; `chrome/browser/browser_process_impl.{h,cc}`; `chrome/browser/prefs/browser_prefs.cc`; `components/subresource_filter/content/browser/{ruleset_service,ruleset_publisher}.{h,cc}`; `chrome/browser/component_updater/subresource_filter_component_installer.cc`.
- Panel: `chrome/browser/ui/content_settings/content_setting_bubble_model.{h,cc}` y `chrome/browser/ui/views/content_setting_bubble_contents.{h,cc}`; pruebas de ambos módulos.
- Generación y pruebas externas: `tools/{prepare_filter_snapshot,sync_filter_snapshot}.py`, `tests/test_filter_snapshot.py`, `tests/test_sync_filters.py`, nuevo `tests/filter-updates-browser.mjs`, fixtures y `docs/validation/2026-11-17-filter-list-updates.md`.

### Task 1: Una generación incluye las excepciones cosméticas

**Interfaces:** `CosmeticExceptionSet` contiene seis vectores de strings (dominios, prefijos y fragmentos de URL, para categorías genérica y total) y dos flags de desactivación. `CosmeticActivation EvaluateCosmeticExceptions(const CosmeticExceptionSet&, const GURL& document_url, const GURL& origin_url)` devuelve `disable_generic` y `disable_all`. El proto `FilteringRules` incorpora estos datos, `UnindexedRulesetWriter::SetCosmeticExceptions(const proto::CosmeticExceptions&)` los escribe una sola vez y `RulesetIndexer::SetCosmeticExceptions(const proto::CosmeticExceptions&)` los incorpora al FlatBuffer. `DocumentSubresourceFilter::GetCosmeticActivation(const GURL&, const GURL&) const` obtiene los flags de su propio índice; la interfaz Blink expone el equivalente para el documento.

- [ ] Añadir casos a `core/common/cosmetic_exceptions_unittest.cc` y `indexed_ruleset_unittest.cc`: round-trip de los ocho campos, ámbito documento/origen, igualdad con los ejemplos de `tests/test_filter_snapshot.py`, excepción desconocida conservadora y dos índices simultáneos con flags distintos. Añadir target específico `//chrome/browser/subresource_filter:senda_filter_updates_unittests` que reúna progresivamente pruebas nuevas y el mínimo soporte GTest de Chromium.
- [ ] Ejecutar ese target y confirmar fallo por interfaces aún ausentes; guardar la salida resumida en el registro de validación.
- [ ] Implementar proto, FlatBuffer y lectores; incrementar `kIndexedFormatVersion`. Sustituir el include estático de `CosmeticExceptions.inc` por flags del índice del documento. Conservar su evaluación sobre URL completa y origen. Evitar que metadatos ausentes en recursos antiguos habiliten ocultaciones nuevas: regenerar la copia incluida en esta misma tarea.
- [ ] Modificar generador/conversor de desarrollo para introducir metadatos tipados en el binario y manifiesto versionado, conservando hashes, licencia y normalización. Adaptar `sync_filter_snapshot.py`; dejar de depender de la cabecera compilada. Un cambio solo de excepciones debe cambiar SHA-256 del binario y su identificación.
- [ ] Ejecutar `python -m unittest discover -s tests -p 'test_*filter*.py'`, compilar/ejecutar el target C++ específico con `-j 4` y verificar round-trip y fixtures. Exportar `patches/0011-senda-filter-generation.patch`, añadirlo a `series` y guardar un commit de tarea.

### Task 2: Conversión acotada dentro del sandbox

**Interfaces:** `CompileResult CompileSendaFilters(base::File easylist, base::File easyprivacy, base::File output)` devuelve estado, versiones, contadores y hashes. Consume archivos de entrada de solo lectura y escribe un binario con el contrato de tarea 1. Mojo `senda.mojom.FilterCompiler.Compile(ReadOnlyFile easylist, ReadOnlyFile easyprivacy, File output) => (CompileResult result)` usa `[ServiceSandbox=sandbox.mojom.Sandbox.kService]`; el navegador conserva las rutas y el servicio solo recibe handles.

- [ ] En `senda_filter_compiler_unittest.cc` definir fixtures mínimos válidos de ambos títulos y casos de HTML, UTF-8, versiones ausentes, límites de tamaño/línea/cantidad, selectores con declaraciones o sintaxis no admitida, excepciones negativas y desconocidas. Comparar salida semántica con fixtures del generador Python, no solo contadores. Definir mínimo de 1000 reglas de red combinadas para producción; fixtures pueden generar ese volumen de reglas distintas.
- [ ] Compilar/ejecutar y confirmar fallo antes de implementar el conversor.
- [ ] Implementar `CompileSendaFilters` reutilizando el parser nativo y `UnindexedRulesetWriter`, sin `CHECK` sobre datos externos ni CLI. Acotar también estructuras auxiliares y salida. Ante error no devolver éxito parcial. Implementar Mojo y registrar servicio en utilidad; no darle fábrica de red. No compartirlo con servicios persistentes.
- [ ] Ampliar target de pruebas y añadir integración Mojo: compilación válida, error de escritura y desconexión/crash. Confirmar que el proceso termina al cerrar el remote y que puede trabajar mediante handles bajo sandbox en Windows.
- [ ] Compilar y ejecutar pruebas nuevas; generar `patches/0012-senda-sandboxed-filter-compiler.patch` y guardar commit de tarea.

### Task 3: Almacén transaccional y selección al arrancar

**Interfaces:** `SendaFilterStore(base::FilePath root)` funciona en una secuencia de bloqueo. `RecoveryResult Recover()` devuelve candidato activo/anterior validado o necesidad de fallback incluido. `StageResult Stage(GenerationManifest manifest, base::FilePath staging_dir)` verifica hashes, tamaños, versiones/formato y mueve el candidato a un directorio inmutable propio. `bool CommitActive(std::string generation_id)` sustituye atómicamente el puntero conservando el anterior. `void Prune()` solo elimina generaciones no seleccionadas que no estén en uso; los fallos de borrado son aplazables. IDs son hashes hexadecimales generados localmente; nunca rutas recibidas de la red.

- [ ] Añadir `senda_filter_store_unittest.cc` con directorios temporales: activo válido, activo corrupto/anterior válido, ambos inválidos/fallback, archivo faltante, metadatos incompatibles, hash alterado, escritura fallida del puntero y cierre simulado en cada etapa. Añadir caso de archivo abierto/mapeado y nombre de generación malicioso.
- [ ] Ejecutar las pruebas para comprobar fallo inicial.
- [ ] Implementar almacén en `UserDataDir/SendaFilterLists`, manifiesto con dos fuentes (versión/hash/ETag/Last-Modified), reglas, licencia y versión del compilador. Identificación incluye todos los datos semánticos; no ETag ni fechas de comprobación. Sincronizar escrituras necesarias antes de reemplazar el puntero. Aceptar solo rutas descendientes propias; no limpiar fuera de la raíz ni borrar activo/anterior.
- [ ] Ejecutar pruebas con inyección de errores de disco y reinicios simulados. Asegurar que fallo en `CommitActive` no impide recuperar una generación previamente válida. Exportar `patches/0013-senda-filter-store.patch` y guardar commit.

### Task 4: Descarga, publicación y programación global

**Interfaces:** `SendaFilterUpdater` es propiedad de `BrowserProcessImpl`; `RegisterLocalStatePrefs(PrefRegistrySimple*)`, `Start()`, `CheckNow()`, `SetAutomaticUpdates(bool)`, `GetStatus() const` y `AddObserver(Observer*)/RemoveObserver(Observer*)`. `FilterUpdateStatus` contiene fase, automático, última comprobación, versión activa y último resultado; no expone datos de sitios. El constructor recibe Local State, directorio de usuario, `SharedURLLoaderFactory`, `RulesetService*`, reloj y task runners inyectables. En `RulesetService`, añadir `PublishRuleset(const UnindexedRulesetInfo&, base::OnceCallback<void(PublishResult)>)`; `PublishResult` incluye ID y éxito solo después de abrir/verificar y publicar esa generación. Las llamadas existentes conservan su API.

- [ ] En `senda_filter_updater_unittest.cc` usar `TestURLLoaderFactory`, reloj simulado y publicador/conversor sustituidos. Probar 200/304, 304 sin caché y nuevo GET incondicional, una lista modificada, ninguna modificada, cambio solo de excepciones, versiones anteriores/iguales con hash distinto, HTTP/TLS/redirect/timeouts, fallos de conversión/indexación y del puntero. Verificar que no haya estado de éxito para otra generación.
- [ ] Añadir pruebas de calendario: arranque diferido, comprobación diaria, 1/6/24 horas tras fallos, botón manual con automático apagado, suspensión larga y cancelación al destruir. Dos solicitudes/perfiles deben producir una sola operación. Confirmar fallos antes de implementar.
- [ ] Implementar descarga secuencial con `SimpleURLLoader::DownloadToFile` y límite descomprimido, condiciones HTTP, timeout y validación de destino exacto en redirecciones. Request `credentials_mode=omit`, sin referente y con anotación de tráfico. No aceptar validadores de un candidato sin comprometer como si fueran activos.
- [ ] Lanzar tarea 2 sobre handles preparados por tarea 3; activar solo si se verificaron las dos fuentes. Publicar e identificar mediante el nuevo callback y comprometer el almacén después. Conservar la protección anterior ante todo fallo. Recuperar estado local al arrancar antes de decidir usar el paquete incluido; no reinstalar este encima de un activo descargado.
- [ ] Registrar prefs `senda.filter_updates.automatic` (true), última comprobación y estado de reintento en Local State. Parar descargas, timers y Mojo durante shutdown antes de destruir `RulesetService`. Añadir guardia en el publicador del componente de anuncios para que no reemplace el conjunto de Senda; conservar los demás componentes y Safe Browsing.
- [ ] Ejecutar pruebas de coordinador y servicio: índice ya publicado, mismo ID, fallo de apertura y cierre con callback pendiente. Añadir prueba explícita de que el componente de anuncios no publica sobre Senda. Exportar `patches/0014-senda-filter-updater.patch` y guardar commit.

### Task 5: Estado y controles en el panel de protección

**Interfaces:** El modelo de panel consulta `SendaFilterUpdater::GetStatus()` y reacciona como observador con suscripción de vida limitada al panel. El toggle llama `SetAutomaticUpdates(bool)` y el botón llama `CheckNow()`. Views separa esta sección global del checkbox existente de excepción por sitio.

- [ ] Ampliar pruebas del modelo y Views para ver sección «Listas de protección», interruptor, versión activa, fecha y botón «Buscar actualizaciones». Comprobar carga en curso, fallo con texto exacto del diseño, panel cerrado antes del callback y perfiles distintos con estado global igual.
- [ ] Confirmar fallo inicial; implementar sección y estados accesibles. El botón durante comprobación no duplica trabajo; etiquetas expresan versión activa y última comprobación separadas. No reutilizar «Volver a cargar» del permiso por sitio ni recargar al actualizar listas.
- [ ] Verificar que marcar la excepción local y activar/desactivar actualizaciones no se alteran mutuamente. El panel se actualiza al completar una búsqueda y deja de observar al cerrarse.
- [ ] Ejecutar pruebas específicas e integración del panel; exportar `patches/0015-senda-filter-update-panel.patch` y guardar commit.

### Task 6: Integración completa, regresiones y entrega reproducible

**Interfaces:** `tests/filter-updates-browser.mjs` usa un perfil temporal exclusivo `compatibility-filter-updates-*`, CDP y fixtures propios; no modifica perfiles personales. La simulación de red se hace en pruebas nativas o mediante sustituciones de test de la fábrica de red, sin permitir endpoints HTTP arbitrarios en producción. Los demás perfiles automatizados desactivan solo su preferencia de actualización cuando necesitan fijar las reglas.

- [ ] Añadir pruebas de navegador: cambio real de bloqueo/CSS/excepciones tras nueva navegación, pestaña antigua coherente, persistencia de excepciones por sitio y reinicio sin conexión. Corromper solo copias del perfil de prueba para demostrar recuperación anterior/incluida y ausencia de periodos sin filtrado. Añadir caso de comprobación en curso al cerrar.
- [ ] Regenerar recursos empaquetados; ejecutar tests Python del generador/sync y tests Node existentes relevantes. Verificar replay de todos los parches contra la revisión fijada y coincidencia de archivos parcheados con el checkout, incluyendo archivos nuevos.
- [ ] Compilar target de pruebas y `chrome` con cuatro tareas y entorno de `tools/Build-Senda.ps1`. Usar `gn gen ... --fail-on-unused-args`; no lanzar ejecutables antiguos si falla la compilación. Si hace falta una ejecución incremental directa, conservar las mismas comprobaciones de revisión/recursos/parches del script y actualizar su sello solo tras éxito.
- [ ] Ejecutar las pruebas nativas nuevas y las pruebas CDP de red, cosméticos, panel y compatibilidad afectadas. No repetir suites previamente válidas sin un cambio que las afecte. Hacer comprobación real de ambas URLs oficiales y verificar el paso a una versión activa confirmada.
- [ ] Medir tiempo de conversión, pico de memoria y procesos tras finalizar; documentar comparación y límites sin prometer cifras no observadas. Inspeccionar visualmente controles, estados y accesibilidad básicos en el perfil de prueba y cerrar los procesos de prueba al acabar.
- [ ] Documentar comandos/resultados/riesgos reales en `docs/validation/2026-11-17-filter-list-updates.md`; mantener artefactos grandes fuera de Git. Revisar diff, ejecutar `git diff --check`, actualizar checklist con evidencia y guardar commit. Tras comprobaciones satisfactorias, subir commits al repositorio `luis21/senda` en la rama de trabajo autorizada.

## Ejecución y comandos de referencia

- Python: `.tools/depot_tools/python3.bat -m unittest discover -s tests -p 'test_*filter*.py'` y los tests de sync explícitos si su nombre no coincide con el patrón.
- Node: `.chromium/src/third_party/node/win/node.exe --test tests/cdp.test.mjs tests/store-test-state.test.mjs tests/new-tab-state.test.mjs`.
- GN/Ninja desde `.chromium/src` con el entorno de Visual Studio configurado por `Build-Senda.ps1`: `gn gen out/SendaDev --fail-on-unused-args`; `autoninja -C out/SendaDev senda_filter_updates_unittests -j 4`; `out/SendaDev/senda_filter_updates_unittests.exe`.
- Navegador final desde raíz: `./tools/Build-Senda.ps1 -Jobs 4`. Guardar salidas extensas en archivos locales de validación y resumir el resultado.

Auto-revisión del plan: requisitos del diseño distribuidos en las seis tareas; riesgos de Review Focus asignados a pruebas concretas; las interfaces mencionadas se definen en su tarea propietaria. No hay aprobación adicional prevista para tareas reversibles dentro de este alcance, una vez revisado el plan.
