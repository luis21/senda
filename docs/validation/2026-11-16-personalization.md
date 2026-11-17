# Personalización de inicio, barra y pestañas

Implementado en la compilación de desarrollo de Senda para Windows. Alcance elegido por Luis: inicio, barra y pestañas.

- Apariencia del sistema, clara y oscura mediante ThemeService de Chromium.
- Cinco paletas nativas: azul, bosque, arcilla, violeta y pizarra. Afectan a la barra y las pestañas reales.
- Fondos locales liso, bruma y líneas; accesos cómodos o compactos y opción de ocultarlos sin eliminarlos.
- Vista previa del inicio; Guardar aplica al navegador. Cancelar, cerrar y Escape descartan la vista previa.
- Lectura del tema existente al abrir; no se sobrescribe automáticamente. Controles nativos deshabilitados si la apariencia está administrada.
- Almacenamiento compatible con los accesos anteriores y sincronización entre pestañas del perfil.

## Validación ejecutada

- Ocho pruebas de estado y compilación TypeScript estricta: aprobadas. Se observaron primero los fallos de migración y conservación de la identidad del acceso en edición y luego su corrección.
- Compilación nativa aprobada con cuatro tareas: 8m57,97s, nueve pasos efectivos en la reanudación; enlace de chrome.dll de 6m39,29s. El ajuste final del ancho del panel se empaquetó en 17,65s, un paso efectivo. Hubo intentos anteriores detenidos por formato CSS, acceso inseguro a un array nativo y recursos abiertos por la ventana de prueba; quedaron corregidos antes de esta validación.
- `tests/personalization-browser.mjs`: las cinco paletas, los tres modos de apariencia, vista previa sin cambiar ThemeService, Cancelar, Escape, rechazo de entradas Mojo fuera de rango, guardado, recarga, sincronización entre pestañas y edición concurrente de accesos: aprobados.
- Reinicio completo del mismo perfil: conserva paleta, apariencia y fondo. Se comprobó por separado seguir colores de Windows con una paleta antigua guardada: se informa «Tema actual» y elegir explícitamente la paleta vuelve a aplicarla.
- `tests/new-tab-browser.mjs`: búsqueda codificada, alta/edición/eliminación, validación de direcciones, persistencia, máximo de doce accesos y restauración del foco, temas y ancho estrecho: aprobados.
- Reproducción de siete parches en 54 archivos: coincide con el código del checkout usado para compilar.
- Revisión independiente: se corrigieron sus dos hallazgos sobre índices de accesos entre pestañas y color de Windows conservado.

La inspección de la ventana real verificó la paleta arcilla conservada al reabrir y el cambio visible de barra, pestañas e inicio al guardar Oscuro. Se cerró sin habilitar un aviso de Adobe Acrobat instalado externamente. Las comprobaciones finales automatizadas excluyen extensiones externas mediante `--disable-extensions`, solo en los perfiles sintéticos. Se utilizó una copia idéntica del lanzador llamada senda.exe para la inspección nativa y esas pruebas.

## Evidencias y reproducción

Las capturas son del contenido de la página, sin la barra nativa:

- [Panel de escritorio](senda-personalization-desktop.png), 1280 × 900.
- [Panel estrecho](senda-personalization-narrow.png), 390 × 844, sin desbordamiento horizontal y con panel del ancho completo.
- [Inicio oscuro](senda-personalization-dark.png).

Con Senda iniciado en un perfil nuevo dentro de `.profiles/personalization-*`, puerto de diagnóstico local y URL `chrome://new-tab-page/`, ejecutar con el Node incluido:

```powershell
.chromium/src/third_party/node/win/node.exe --test tests/new-tab-state.test.mjs
.chromium/src/third_party/node/win/node.exe tests/personalization-browser.mjs .profiles/personalization-prueba
```

El comprobador requiere `DevToolsActivePort` del perfil indicado y cierra ese navegador al terminar. `--restart` comprueba el estado final del caso completo tras volver a abrirlo. `--device` comprueba un perfil de prueba previamente preparado con `browser.theme.follows_system_colors=true`; no modifica políticas de Windows.

## Límites

No se ejecutaron las suites C++ completas, una compilación de distribución optimizada, ni pruebas en un equipo administrado o con extensiones de temas activas. La vista previa web solo puede cambiar el inicio; las barras se personalizan dentro de Senda. Los fondos incluidos usan CSS y no se añadió carga de fotografías. Los cambios permanecen en una rama local; no se han publicado en GitHub.
