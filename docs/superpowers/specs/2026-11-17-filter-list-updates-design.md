# Actualización de listas de protección de Senda

Fecha: 2026-11-17. Estado: diseño pendiente de aprobación de Luis.

## Objetivo y decisión del usuario

Actualizar automáticamente EasyList y EasyPrivacy mediante descarga directa de las fuentes oficiales. Senda debe seguir protegiendo sin conexión y ante errores de descarga, conversión o almacenamiento. Las actualizaciones no deben exigir recompilar el navegador, instalar herramientas de desarrollo ni mantener un proceso adicional en reposo.

Fuentes fijas:

- https://easylist.to/easylist/easylist.txt
- https://easylist.to/easylist/easyprivacy.txt

La procedencia se verifica mediante HTTPS y certificados válidos. Estas fuentes no proporcionan aquí un paquete firmado por Senda: el SHA-256 local comprueba integridad y coherencia de archivos, no autentica por sí mismo al editor. Se conserva la atribución y licencia de las listas.

## Comportamiento propuesto — decisiones de implementación

Estas decisiones son propuestas del implementador, salvo la descarga directa ya elegida por Luis:

- Actualización automática activada inicialmente. Comprobación diaria mientras Senda esté abierto, diferida al terminar el arranque. No habrá servicio de Windows, inicio automático del navegador ni comprobación con el navegador cerrado.
- En el panel de protección habrá una sección «Listas de protección» con interruptor de actualización automática, botón «Buscar actualizaciones», versión activa, fecha de última comprobación y resultado. Es una configuración compartida por los perfiles del mismo directorio de usuario; las excepciones por sitio siguen siendo propias de cada perfil.
- El botón manual funciona también con las actualizaciones automáticas desactivadas. Las solicitudes concurrentes se agrupan en una sola operación. No se prometen actualizaciones instantáneas al publicar los autores.
- Se conservan ETag y Last-Modified. Una respuesta 304 solo se acepta si existe la copia local íntegra correspondiente. No se recompilan fuentes sin cambios. Si cambia una lista, se combina con la última copia válida de la otra; ambas deben haber sido verificadas satisfactoriamente en esa comprobación antes de activar la generación.
- Fallos transitorios: reintentos al cabo de 1 hora, 6 horas y después 24 horas, solo mientras esté abierto. Una búsqueda manual puede anticiparlos. Al reanudar tras una larga suspensión se hace una comprobación pendiente, sin acumular tareas.
- Al actualizar se aplican las reglas a las nuevas navegaciones o recargas. No se recargan pestañas automáticamente ni se interrumpen formularios. Cada documento conserva una generación coherente durante su vida.
- El error se muestra en el panel: «No se pudo actualizar. Se conserva la versión anterior». No habrá avisos emergentes repetitivos ni telemetría nueva.

## Integración con el código existente

Senda 156.0.8078.80 ya empaqueta reglas convertidas mediante `tools/prepare_filter_snapshot.py`. El motor `RulesetService` indexa reglas de red y selectores CSS y las publica para los renderizadores. Las excepciones de ocultación se compilan actualmente en `CosmeticExceptions.inc`; ese archivo estático impide actualizar correctamente todas las reglas en ejecución.

La nueva implementación reutilizará el analizador y escritor nativos de Chromium. No ejecutará Python, `ruleset_converter.exe` ni código descargado. Un servicio de utilidad con sandbox realizará la conversión con archivos acotados entregados por el navegador, sin acceso de red propio, y terminará tras el trabajo. La descarga empleará Network Service con HTTPS normal, sin cookies, credenciales, referente ni identificadores añadidos. Una anotación de tráfico describirá esta conexión.

La normalización preservará las garantías actuales: excepciones de selectores, dominios negativos, selectores genéricos y tratamiento conservador de excepciones incompatibles. Las excepciones desconocidas no podrán provocar ocultaciones adicionales. El analizador existente no valida toda la sintaxis CSS: se rechazarán selectores peligrosos o inválidos para este formato, incluidos bloques/declaraciones, caracteres de control y construcciones no admitidas; no se añadirán scriptlets. Las listas se tratan como datos no confiables.

Reglas de red, CSS y metadatos tipados de excepciones deberán estar en la misma generación publicada. La codificación concreta queda al constructor, preferentemente extendiendo el formato indexado y su versión. No se sincronizarán mediante dos notificaciones independientes ni mediante cabeceras C++ descargadas. El identificador de contenido incluirá todos los componentes y la versión del formato, de modo que una actualización solo de excepciones también se active. Se actualizarán el generador de la copia incluida y su validador para producir el mismo contrato.

Un coordinador del proceso principal, configurado en Local State, será dueño de descargas, programación y activación. El servicio actual usa la configuración de reglas de Safe Browsing y existe un publicador del componente de reglas de anuncios de Chromium que puede escribir en ese mismo servicio. La implementación deberá garantizar un único dueño del conjunto de Senda: aislar su servicio o impedir que ese publicador de reglas de anuncios sustituya sus generaciones. La elección interna queda al constructor tras revisar el registro efectivo del componente. Se mantienen las comprobaciones de sitios y descargas peligrosos y sus actualizaciones de Safe Browsing.

## Publicación, almacenamiento y recuperación

Los datos se guardarán en un subdirectorio propio `SendaFilterLists` del directorio de usuario. Cada generación es inmutable e incluye fuentes, reglas compiladas, metadatos, hashes y licencia. Se conserva la generación activa y una anterior válida, además de la copia incluida en el ejecutable.

Secuencia: descargar a preparación → validar ambas fuentes → convertir → validar artefactos → indexar → recibir confirmación de publicación de esa generación → guardar el puntero activo de forma atómica. No se notificará éxito por la mera recepción de archivos ni por un callback genérico de «algún conjunto listo». La interfaz mostrará por separado la última comprobación y la versión realmente activa.

Al arrancar se selecciona una generación local válida sin esperar a Internet. El arranque no reinstala la copia incluida sobre una descarga más reciente. Si falla la actual, se intenta la anterior y luego la incluida; el índice se reconstruye si es necesario. Un candidato incompleto o fallido no sustituye a la protección activa. Un cierre durante la publicación debe poder recuperarse en el siguiente arranque mediante validación de los archivos y del puntero. Los archivos en uso por renderizadores no se borran; la limpieza se limita al directorio propio y puede aplazarse en Windows.

Se rechazan versiones de fuente anteriores a la última aceptada de esa misma lista. Una revisión con igual versión pero distinto hash puede aceptarse si supera toda la validación. El estado válido no se invalida por fallos de red ni por respuestas 304 cuando falta la caché: en este último caso se repite sin condiciones HTTP. El formato de metadatos se versiona; los datos incompatibles se dejan de usar de forma segura y se recupera la copia incluida.

## Límites iniciales — decisiones del implementador

Descargas secuenciales, máximo 20 MiB descomprimidos por fuente, 60 segundos por solicitud, hasta 1 millón de líneas por fuente y 64 KiB por línea. Máximo 20 MiB de reglas sin indexar, coherente con el generador actual. Se rechazan HTML, errores HTTP, UTF-8 inválido, encabezados o versiones ausentes y listas truncadas o sin un mínimo razonable de reglas. Los límites de reglas y excepciones se comprobarán antes de reservar memoria proporcional a datos externos.

Solo se admiten los dos destinos oficiales anteriores; cualquier redirección fuera de esos destinos se rechaza. Nunca se cambia de fuente a partir del cuerpo recibido. No se desactivan certificados ni sandbox. La cancelación al cerrar debe liberar el trabajo y dejar únicamente preparación recuperable. Las cifras de memoria y tiempo se medirán con las listas actuales; no se declara ahorro de RAM sin una comparación medida. Si la conversión excede límites o falla, se conserva la generación activa.

## Verificación y criterios de aceptación

- Pruebas nativas con red simulada: 200, 304, sin cambios, cambio de una sola fuente, caché ausente, descargas simultáneamente solicitadas, automático desactivado y búsqueda manual, reintentos y cierre.
- Fixtures de conversión comparados con la semántica del generador actual: reglas de red, CSS por dominio y genéricas, excepciones negativas e incompatibles y cambio únicamente de excepciones.
- Casos negativos: HTML, UTF-8 inválido, límites, timeout, TLS, redirección, versión anterior, conversión fallida, índice inválido, escritura interrumpida y metadatos incompatibles. Ninguno deja sin protección al navegador.
- Pruebas de activación y reinicio sin conexión, caché corrupta, recuperación anterior/incluida, pestañas antiguas frente a nuevas y persistencia de excepciones por sitio. Verificar que ningún publicador de componentes pisa las reglas de Senda.
- Verificar credenciales y cabeceras de red, ausencia de proceso de conversión en reposo y consumo transitorio de memoria. Comprobar una descarga real de ambas fuentes oficiales.
- Pruebas existentes relevantes de bloqueo, ocultación, personalización y compatibilidad con extensiones. Los perfiles de prueba ajenos al actualizador congelarán sus actualizaciones para conservar fixtures deterministas, sin cambiar el comportamiento de producción.
- Compilación nativa con cuatro tareas. Pruebas C++ específicas del coordinador/conversor y pruebas de navegador proporcionales, evitando compilar suites completas sin necesidad. Los puntos de prueba no permitirán fuentes HTTP arbitrarias en producción.

Fuera de alcance: suscripciones personalizadas, nuevas listas, servidor o firmas propios de Senda, actualización del ejecutable, sincronización entre dispositivos y publicación de una nueva versión distribuible.

## Entrega prevista

Tras aprobar este diseño: plan de implementación con parches reproducibles, implementación y pruebas, compilación y verificación de Senda, documentación del resultado y subida de los cambios al repositorio autorizado. El diseño por sí solo no implementa todavía las actualizaciones.
