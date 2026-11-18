# Actualización de listas: validación en curso

## Tarea 1 — generación coherente (2026-11-17)

Se incorporaron las excepciones cosméticas al proto y al índice FlatBuffer de las reglas. El documento consulta su propio índice, eliminando la dependencia de la cabecera de excepciones compilada. El formato indexado pasa de 38 a 39; el snapshot empaquetado pasa a esquema 2. El SHA-256 incluye las excepciones, incluso si no cambian las reglas de red.

Verificaciones realizadas:

- Prueba nativa inicialmente fallida por APIs ausentes; después 4/4 casos pasan: serialización completa, compatibilidad de bytes con el empaquetador Python, generaciones simultáneas y fallback conservador sin metadatos.
- Pruebas Python: los casos nuevos fallaron antes de implementar; resultado final 18/18.
- Compilados los puntos de integración de Blink y del renderer con cuatro tareas.
- Replay de 11 parches sobre la revisión fijada: PASS; 89 archivos coinciden con el checkout.
- Snapshot: 106891 reglas de red, 23533 reglas cosméticas compiladas; 5352714 bytes; SHA-256 `094ed4a33596da4edd2181f273b68715a59c66fcb4466fb84fc38289f86a58fb`.

Todavía no se declara completado el actualizador: faltan conversión aislada, almacenamiento, descargas, panel y pruebas finales del navegador. No se ha recompilado el ejecutable completo tras este cambio.

## Tarea 2 — conversor nativo y servicio de utilidad

Se implementó un conversor que recibe handles de dos fuentes y un archivo de salida. Valida títulos, UTF-8, versión/fecha, tamaños y líneas; conserva excepciones y normaliza dominios negativos. Tiene límites de salida, metadatos y memoria de selectores, incluyendo su expansión por dominios excluidos. Se registró una interfaz Mojo con sandbox `kService`, sin fábrica de red.

- Once pruebas nativas pasan, incluidas las listas completas vendorizadas: 106891 reglas de red y 23533 visuales, iguales a los contadores del generador actual.
- Conversión más indexación y verificación de la salida completa: 3954 ms en esta ejecución. No es una medición de descarga ni una promesa de latencia.
- Se reprodujo y corrigió una omisión de 224 selectores con punto y coma dentro de atributos entre comillas; su prueba falló antes de corregir el analizador.
- Se compilaron el servicio Mojo, sus tipos generados y su registro en utilidad. La prueba de aislamiento, desconexión y vida del proceso real queda para la integración con el cliente del navegador; todavía no se declara verificada en ejecución.
- Replay de 12 parches y comparación con el checkout: PASS.

## Tarea 3 — almacén y recuperación

Se añadió un almacén secuenciado con generaciones inmutables, manifiesto versionado, comprobación SHA-256 de las dos fuentes, reglas y licencia, y puntero activo/anterior escrito de forma atómica. La limpieza valida rutas y aplaza archivos cuyo borrado Windows rechaza.

- Siete pruebas de almacén pasan: recuperación anterior al corromper la activa, corrupción de fuentes, escritura fallida del puntero, preparación interrumpida, rechazo de rutas externas/IDs maliciosos, reconstrucción de puntero corrupto, formato incompatible, reparación del mismo contenido, conservación de activo/anterior y archivo abierto, y metadatos HTTP con controles de cabecera.
- Las corrupciones de reglas y fuente conservan el tamaño original para comprobar el hash, no solo el tamaño. La prueba de formato cambia únicamente el número de esquema.
- Las 17 pruebas nativas locales pasan juntas; la prueba adicional con listas completas ya pasó en tarea 2 y el conversor no cambió desde entonces.
- Replay de 13 parches y coincidencia con el checkout: PASS.

Pendientes: coordinador de red/publicación, controles del panel, ejecución real del servicio con sandbox y validación final del navegador completo.

## Tarea 4 — coordinación y conexión al navegador

El coordinador descarga ambas URLs oficiales secuencialmente, usa validadores HTTP, convierte candidatos y espera confirmación de la generación publicada antes de guardar el puntero activo. Las preferencias son globales por directorio de usuario. Se añadió una configuración independiente de reglas Senda para impedir que el componente de anuncios de Google las reemplace; la protección de amenazas de Safe Browsing se conserva.

- 17 pruebas del coordinador pasan con red/reloj simulados: 200/304, fuentes sin cambios, excepción como único cambio, rollback de versiones, solicitudes agrupadas, automático desactivado/manual, caché perdida/reparada, reinicio sin conexión, plazos 1/6/24 horas, cierre, certificados, redirecciones, descargas grandes, fallo de publicación y fallo del puntero con recuperación de la versión publicada anterior.
- Casos fallidos observados y corregidos: lectura de ETag como cabecera no combinable, limpieza asíncrona con retorno ignorado, 304 sin caché, cómputo del reintento desde el fallo y copia recuperada antigua que se presentaba como vigente.
- Cinco pruebas adicionales de artefactos validan forma, tamaños, metadatos y rechazo de CSS capaz de introducir declaraciones/importaciones. Se reprodujo y corrigió el desbordamiento de longitud uint32 del lector genérico, que antes aceptaba como vacío un mensaje inválido.
- Última ejecución completa antes de cinco casos negativos adicionales: 35 pruebas nativas pasan, incluyendo listas completas; esos cinco nuevos casos también pasan. Se realizará una ejecución conjunta final.
- 19 pruebas Python pasan. El bootstrap recibe versiones/licencia desde un include generado únicamente durante la preparación de la copia de respaldo; las descargas de ejecución siguen siendo datos y no generan C++ ni usan Python.
- Los objetos de conexión de arranque, preferencias, proceso de utilidad y servicio de reglas compilaron. El cliente del proceso espera su terminación antes de validar/indexar la salida; su comprobación real con sandbox sigue pendiente de la compilación completa en tarea 6.
- El parche 0014 se aplica sobre los trece anteriores. La comparación global con el checkout se repetirá al exportar también el panel que se está implementando.

## Panel y verificación conjunta — 18 de noviembre

El panel incorpora controles globales independientes de la excepción por sitio: actualización automática, búsqueda manual, versiones de ambas listas, última comprobación y resultado. El botón se desactiva durante una operación; la suscripción se libera al cerrar el panel. Su objeto C++ compila. La revisión visual y de interacción todavía está pendiente.

- Replay de 15 parches: PASS, 122 archivos coinciden con el checkout. Se corrigió la codificación UTF-8 de textos españoles durante la exportación de parches.
- Ejecución conjunta: 40/40 pruebas nativas PASS, con las fuentes completas vendorizadas y validación adicional de la copia binaria incluida.
- Preparación de caché por el ejecutable de pruebas: PASS. Solo admite perfiles con nombre `compatibility-filter-updates-*` bajo `.profiles`; no añade endpoints alternativos al navegador.
- `tests/filter-updates-browser.mjs` prepara una generación sintética y comprueba su sustitución desde las URLs oficiales, coherencia de pestañas antiguas, reinicio y recuperación tras corrupción. La ejecución completa requiere terminar la nueva compilación del navegador.

## Revisión independiente y correcciones

Un único revisor independiente identificó un hallazgo crítico y cinco importantes; no dejó menores ni conductas sin juzgar. La compilación completa se pausó para corregirlos:

- Preflight recursivo sin asignaciones antes de protobuf: límites por campo y presupuesto agregado de 65.536 elementos por chunk. Se reprodujeron rechazos ausentes para dominios, clases y excepciones anidados.
- Recuperación de arranque independiente del índice previo: el coordinador elige una generación antes de liberar la primera navegación. El respaldo también necesita confirmación; si falla, muestra error y permite reintentar manualmente. La prueba de navegador ya no recarga para esconder una selección inicial incorrecta.
- Un 304 requiere transporte satisfactorio y un validador realmente enviado. Un 304 no solicitado fuerza como máximo una nueva solicitud incondicional. La prueba de 304 con fallo de transporte ya rechazaba el caso de la fábrica de red; el guard explícito refuerza el contrato.
- Mínimo de 100 reglas de red aceptadas por fuente, además de 1.000 combinadas. Una fuente formada por reglas no compatibles ya no puede sustituir protección válida.
- Limpieza de índices durante la misma sesión tras commit satisfactorio, conservando actual/anterior y sentinels. Las comprobaciones posteriores reintentan archivos ocupados. La prueba de Windows detectó además diferencias entre separadores de ruta y motivó su normalización antes de comparar.
- Observación de reanudación: se reevalúa el plazo persistido al despertar y se agrupan las solicitudes si ya hay una operación activa.

Las regresiones fallaron antes de la corrección. Resultado conjunto final: **48/48 pruebas nativas PASS**, con ambas fuentes completas y respaldo binario; objetos de arranque, throttle y servicio compilan. Replay de **17 parches y 126 archivos: PASS**. Compilación completa y ejecución real/visual aún pendientes.
