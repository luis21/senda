# Extensiones de Chrome Web Store y sitios públicos

Se verificaron dos extensiones instaladas realmente desde Chrome Web Store en Senda, junto con una primera muestra de sitios públicos. La compilación utilizada conserva los diez parches ya verificados; esta ronda añade comprobadores y evidencia, sin cambios del motor.

## Extensiones instaladas

| Extensión | ID | Versión observada | Manifest |
| --- | --- | --- | --- |
| [uBlock Origin Lite](https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh) | `ddkjiahejlhfcafbddmgiahcphecmpfh` | 2026.1116.1650 | 3 |
| [Dark Reader](https://chromewebstore.google.com/detail/dark-reader/eimadpbcbfnmbkopoojfekhnkhdbieeh) | `eimadpbcbfnmbkopoojfekhnkhdbieeh` | 4.9.135 | 3 |

El usuario completó las instalaciones y confirmó sus avisos en un perfil desechable. La API nativa confirmó `ENABLED` y `FROM_STORE`; el registro protegido conserva `from_webstore=true` y ubicación interna 1. No se cargaron copias sin empaquetar ni se modificaron los archivos instalados.

La tienda mostró un aviso para cambiar a Chrome, pero permitió instalar ambas extensiones. El controlador de ventanas rechazó la selección de Senda; por ello las confirmaciones de instalación se hicieron manualmente y las verificaciones posteriores usaron las APIs nativas del navegador.

## Atribución del bloqueo

El servidor de prueba solo escucha en loopback. `site.senda.test` y el dominio publicitario se resuelven a 127.0.0.1 dentro del proceso de prueba; no se envían esas peticiones al dominio publicitario real. En todas las combinaciones se comprobó que el script legítimo llegaba y se ejecutaba.

| Protección nativa para la página local | uBOL | Petición publicitaria llega al servidor |
| --- | --- | --- |
| Exceptuada temporalmente | Habilitada | No |
| Exceptuada temporalmente | Deshabilitada | Sí |
| Activa, después de reiniciar | Habilitada | No |
| Activa | Deshabilitada | No |

Esto distingue el bloqueo de la extensión del bloqueo propio de Senda. La excepción nativa solo afectó al origen local y puerto de la prueba; se restauró antes del segundo arranque y se comprobó en el archivo de preferencias al finalizar. Ambas extensiones terminaron habilitadas.

uBOL cargó ocho conjuntos de reglas: `easylist`, `easyprivacy`, `pgl`, `spa-0`, `spa-1`, `ublock-badware`, `ublock-filters` y `urlhaus-full`. Se conservaron al reiniciar. También se observó su worker pasar de `running` a `stopping` y `stopped`; el filtrado siguió funcionando. Se utiliza `ServiceWorker.workerVersionUpdated`, porque la presencia de un objetivo de depuración no demuestra que el worker esté ejecutándose.

Dark Reader transformó la página local blanca al habilitarse. El fondo pasó a `rgb(24, 26, 27)` y el texto a `rgb(232, 230, 227)`; esos colores se conservaron después del reinicio. Se comprobaron hojas de estilo transformadas, además del resultado visible.

## Sitios y multimedia

| Caso | Resultado y alcance |
| --- | --- |
| [MDN: Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) | PASS: documento HTTP 200, contenido principal y CSS visibles |
| [Wikipedia: Web browser](https://en.wikipedia.org/wiki/Web_browser) | PASS: carga y navegación al artículo enlazado de Google Chrome |
| [Repositorio público de Chromium](https://github.com/chromium/chromium) | PASS: carga básica del repositorio y su interfaz, sin iniciar sesión |
| Video WebM público de MDN | PASS: dimensiones válidas, fotogramas decodificados en aumento y sin error de reproducción; video silenciado |
| Wikipedia con ambas extensiones, en ventana normal | PASS: documento legible, colores oscuros, nueve hojas transformadas y navegación interna |

La muestra inicial de sitios se ejecutó en perfiles nuevos. La prueba conjunta con extensiones reutilizó exclusivamente el perfil desechable de la tienda. Los comprobadores no inician sesión ni envían formularios o publicaciones.

El [resumen JSON](2026-11-17-store-and-sites-results.json) conserva los resultados seleccionados y las referencias a sus artefactos locales. Las capturas y los informes completos permanecen en `.profiles/`, fuera de Git; no se publica el inventario de otros complementos del equipo.

## Reproducción

Para la muestra pública, desde la raíz del proyecto y con una compilación verificada:

```powershell
$node = '.chromium/src/third_party/node/win/node.exe'
& $node tests/public-sites-browser.mjs .profiles/compatibility-public-manual
# Solo un caso, para investigar un fallo sin repetir toda la muestra:
& $node tests/public-sites-browser.mjs .profiles/compatibility-public-wiki-manual --case=wikipedia
```

Cada perfil nuevo debe ser un hijo directo de `.profiles` y llamarse `compatibility-*`. Para las extensiones, crear un perfil diferente con nombre `compatibility-cws-*` y abrir Senda con depuración local:

```powershell
$profile = Join-Path $PWD '.profiles/compatibility-cws-manual'
& '.chromium/src/out/SendaDev/chrome.exe' "--user-data-dir=$profile" --remote-debugging-port=0 --no-first-run --no-default-browser-check 'https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh'
```

Instalar ambas extensiones desde sus fichas oficiales en esa misma ventana, confirmar los permisos y salir de ese perfil. Después:

```powershell
& $node tests/store-extensions-browser.mjs $profile
& $node tests/public-sites-browser.mjs $profile --installed-profile --case=wikipedia --headed
```

El primer comprobador rechaza perfiles fuera de la ruta prevista y un puerto de depuración todavía activo. Durante la prueba deshabilita y vuelve a habilitar únicamente las extensiones indicadas y modifica una excepción local temporal. Su limpieza intenta restaurar cada estado independientemente y devuelve FAIL si no puede verificar la restauración. `--ubol-only` permite probar solo uBOL, sin declarar probado Dark Reader.

Los informes se guardan en `store-check-*` y `public-check-*` dentro del perfil. Las páginas públicas y la versión que distribuye la tienda pueden cambiar; los fallos necesitan revisión y no deben interpretarse automáticamente como defectos del motor.

## Calidad del comprobador y límites

La revisión independiente detectó dos huecos de restauración: una respuesta perdida al deshabilitar una extensión y un error de cierre que podía impedir restaurar la excepción local. Cuatro pruebas reprodujeron esos fallos antes de corregirlos y aprobaron después. Junto con el transporte CDP y el estado del inicio, pasaron **16 pruebas Node**.

Se corrigieron también supuestos del comprobador: un enlace de Wikipedia que no estaba presente, el uso de objetivos de depuración como indicador de ejecución de workers y la exigencia de un atributo interno de Dark Reader. En Wikipedia ese atributo faltaba aunque el tema y las hojas transformadas sí estaban aplicados. Se conservan los informes iniciales fallidos; la verificación final comprueba el comportamiento observable.

Esto acredita una muestra de instalación, permisos operativos, coexistencia, cambios visuales y persistencia. Siguen pendientes las actualizaciones firmadas de extensiones comerciales, más sitios y recorridos completos con cuentas, otros formatos multimedia y DRM. Tampoco sustituye la comparación de RAM, la actualización automática de listas, el instalador ni el mecanismo seguro de actualización de Senda.
