# Validación de la primera capa de protección

Estado: primera capa nativa compilada y validada en el navegador. No representa todavía un bloqueador completo.

## Procedencia y conversión

Fuentes oficiales: [EasyList](https://easylist.to/easylist/easylist.txt) y [EasyPrivacy](https://easylist.to/easylist/easyprivacy.txt), versión de instantánea `202611160028` UTC. Se eligió su licencia alternativa CC BY-SA 3.0; las fuentes, atribución y licencia se conservan en `third_party/easylist/` y `assets/filters/`.

La conversión usa `ruleset_converter.exe` de la revisión fijada de Chromium. El modo de compatibilidad 59 elimina sintaxis que su motor no admite. Resultado: 106.891 reglas de red convertidas, 4.179.410 bytes, SHA-256 `ed1720911678478563bbf57b27b8246883529cb218aea0244c1e4684a1826b7d`. El indexador informó además 20 reglas no admitidas, que descarta. Se analizaron 23.845 reglas cosméticas que **no están activadas**. No se afirma compatibilidad completa con EasyList.

## Evidencia disponible

- Herramientas nativas de conversión compiladas correctamente (12 pasos, 24,84 segundos).
- Seis pruebas Python correctas: fuentes inválidas, versión, tamaño, SHA-256, preservación del destino ante datos corruptos y copia de archivos/licencia de nombres fijos.
- Prueba RED en el binario anterior, con servidor local y perfil exclusivo: el recurso legítimo, el anuncio y el rastreador llegaron al servidor y se ejecutaron. La aserción de bloqueo falló como se esperaba.
- Revisión independiente identificó tres problemas: navegación antes de disponer del índice, desactivación por aviso Better Ads y falta de recuperación de índice corrupto. Se modificaron esos caminos y se agregó verificación previa del candidato antes de sustituir el índice válido. La recuperación y el primer arranque se confirmaron en ejecución; la condición de aviso Better Ads se revisó en código, sin simular una respuesta remota del servicio.
- Primera compilación: correcta en 7m42s, 48 pasos. La prueba de primer arranque falló: decisión de activación=1 (activado), estado efectivo=0 y razón=7 (índice no disponible/corrupto). El índice sí existe y `subresource_filter_tool` confirma que ambas URLs deben bloquearse. Reutilizar el mismo perfil pasa: recurso legítimo permitido, anuncio/rastreador bloqueados y ausentes del servidor; cookies=1, sugerencias=false, Safe Browsing=true. Esto identifica una carrera: AdTagging crea una referencia vacía al construir los throttles, antes de esperar la publicación. La corrección evita esa preactivación cuando ya existe una configuración de bloqueo ALL_SITES; el filtro se crea al recibir la activación posterior a la barrera.

La prueba `tests/network-protection-browser.mjs` redirige dominios ficticios y el dominio publicitario al servidor de bucle local. No necesita enviar solicitudes de anuncios a Internet. Abre su URL como primera navegación del proceso; comprueba que los recursos bloqueados tampoco lleguen al servidor. Usa exclusivamente perfiles dentro de `.profiles/` y cierra su navegador al terminar.

## Resultado final

Compilación final correcta: 6m22,82s, 21 pasos. Registro `.tools/build-protection.log`. Parche `0003-senda-network-protection.patch`, incluido en `patches/series` y comprobado con `git apply --reverse --check`.

| Comprobación real | Resultado |
| --- | --- |
| Primer arranque, perfil nuevo `protection-green-final` | Carga `/good.js`; anuncio y rastreador no se ejecutan ni llegan al servidor. |
| Preferencias iniciales | `profile.cookie_controls_mode=1`, `search.suggest_enabled=false`, `safebrowsing.enabled=true`. |
| Índice corrupto del mismo perfil | Se sustituyó el archivo de índice por texto inválido antes de reiniciar. Se reconstruye y bloquea desde la primera página. |
| Excepción explícita, perfil `protection-allow-final` | Cargan los tres recursos; anuncio y rastreador llegan al servidor, como se autorizó para ese sitio. |
| Preferencias explícitas | Cookies=0 y sugerencias=true se conservan; Safe Browsing sigue habilitado. |
| Índice no escribible, perfil `protection-unavailable-final` | Se muestra el error explícito de protección; ninguna solicitud de la página llega al servidor. |

Registros de cada escenario: `.tools/protection-{fresh,recovery,allow,unavailable}.log`. Los navegadores y servidores de prueba se cerraron limpiamente. Además: seis pruebas Python de listas y 15 pruebas PowerShell de preparación/lanzamiento correctas.

Se actualizaron las expectativas C++ del dealer por su verificación anticipada, incluyendo conservación del índice anterior ante un candidato corrupto. Esa suite C++ no se ejecutó: su infraestructura agregaba miles de pasos de compilación; se retiró el target auxiliar y se usaron las comprobaciones del navegador real descritas arriba. No se afirma que toda la suite de Chromium pase.

## Límites

Pendientes: filtrado cosmético, panel propio, contador, actualización automática de listas, auditoría de conexiones heredadas, muestra amplia de compatibilidad de sitios y mediciones de RAM. Cookies de terceros y sugerencias son valores iniciales: se respetan cambios explícitos del perfil. La prueba de cookies comprueba el ajuste activo, sin una prueba independiente de toda la semántica de almacenamiento entre sitios. La conservación de Safe Browsing no equivale a una prueba completa de detección de malware ni de sus servicios remotos en este fork. Las atribuciones están en las fuentes; el empaquetado público deberá incluirlas, ya que el modo de desarrollo de Chromium usa una página de créditos de muestra.
