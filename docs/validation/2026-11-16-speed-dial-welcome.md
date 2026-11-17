# Inicio con mosaicos, bienvenida e iconos de Senda

Implementado y validado en la compilación de desarrollo de Senda para Windows.

## Resultado

- Inicio inspirado en la referencia de Opera: buscador centrado, mosaicos con etiquetas debajo, seis columnas a ancho amplio, dos en móvil y hasta 48 sitios.
- Fondo «Pliegues» original, en SVG local. Se conservan los fondos y preferencias de perfiles anteriores.
- Favicons de la caché local de Chromium, sin permitir servidores externos de respaldo. Si no existe un icono guardado, el mosaico usa la inicial del título.
- Bienvenida de primera visita y vista de novedades. La casilla «Ocultar bienvenida y novedades» se guarda al continuar y también puede cambiarse desde Personalizar. Desactivarla vuelve a abrir la vista al guardar y en nuevas pestañas. El botón Novedades permite abrirla manualmente.
- Icono propio en el ejecutable, lista de aplicaciones, logotipos internos y favicon de Nueva pestaña. El ejecutable contiene nueve tamaños; la pestaña utiliza una máscara transparente para conservar la S al aplicar el tinte del navegador.

## Comprobaciones ejecutadas

- Diez pruebas TypeScript de estado: migración, URLs, almacenamiento, límite de 48, bienvenida/interruptor, identidad al editar entre pestañas y URL de favicon local. Compilación TypeScript estricta aprobada.
- Tres pruebas Python: estructura del ICO, tamaños PNG y máscara separada para la pestaña. Se observaron fallos antes de generar los recursos nuevos.
- `tests/verify-built-icon.py`: los nueve PNG de `IDR_MAINFRAME` del ejecutable compilado coinciden byte por byte con los assets de Senda. El ejecutable anterior falló esta comprobación.
- `tests/speed-dial-browser.mjs`: primera visita, ocultación desde esa primera visita, acceso manual a novedades, desactivación del interruptor, recarga, foco, 32 sitios, seis/dos columnas, fondos y modos claro/oscuro aprobados.
- Reinicio completo con el mismo perfil: bienvenida oculta, 32 sitios y fondo conservados.
- Servidor local de prueba: **cero peticiones** a las URLs de los 32 sitios al mostrar el inicio y solicitar sus iconos locales.
- `tests/new-tab-browser.mjs`: búsqueda codificada, validación de direcciones, alta/edición/eliminación, persistencia, máximo de 48 sitios y foco, temas y ancho estrecho aprobados.
- Nueve parches reproducidos en 74 archivos; coinciden con el checkout compilado, incluidos los recursos binarios.

La compilación nativa principal terminó en 6m59,33s, con 20 pasos efectivos y cuatro tareas; el enlace se limitó a una tarea. Las correcciones posteriores de interfaz se empaquetaron de forma incremental. El último ajuste de los recursos de pestaña terminó en 16,79s, tres pasos, sin recompilar el núcleo.

La revisión independiente encontró y permitió corregir la carga diferida de favicons inicialmente ocultos y la prioridad del interruptor en la primera visita. La inspección visual detectó además una carrera entre la lectura inicial del tema nativo y su selección; se reprodujo con una prueba que obtenía `system` después de seleccionar `light`. Personalizar ahora espera la inicialización nativa y la prueba final conserva `light`/`dark` después del pintado.

La ventana real de Windows mostró la bienvenida y el paso al inicio mediante Empezar a navegar. Se inspeccionó también la S final de la pestaña. Los perfiles de prueba excluyen extensiones externas con una opción de lanzamiento; no se cambió ningún perfil personal ni la configuración de extensiones del usuario.

## Evidencias

Las capturas usan sitios de prueba, no una importación de los favoritos de Opera:

- [Inicio de escritorio](senda-speed-dial-desktop.png).
- [Inicio estrecho](senda-speed-dial-narrow.png).
- [Inicio oscuro](senda-speed-dial-dark.png).
- [Bienvenida](senda-welcome-desktop.png).
- [Bienvenida estrecha](senda-welcome-narrow.png).

Para repetir las pruebas de navegador, iniciar Senda con una URL `chrome://new-tab-page/`, puerto de diagnóstico local y un perfil nuevo `.profiles/speed-dial-*`; luego ejecutar `tests/speed-dial-browser.mjs` con el Node incluido y esa ruta de perfil. El comprobador cierra el navegador al terminar. Tras reiniciar el mismo perfil, `--restart` verifica su estado final.

## Límites

No se importaron sitios, historial ni miniaturas de Opera. Los favicons reales aparecen cuando están disponibles en la caché local; no se descargan automáticamente para decorar el inicio. Las novedades se distribuyen con el código del navegador, sin un servicio remoto. No se crearon un instalador de distribución ni recursos para macOS, y no se ejecutó la suite C++ completa. Los cambios permanecen en una rama local, sin publicar en GitHub.
