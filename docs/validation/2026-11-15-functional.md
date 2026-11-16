# Validación funcional de la base

Versión: 156.0.8078.80. Perfil exclusivo `.profiles/senda-functional`. No se utilizaron perfiles personales ni opciones que desactiven el sandbox o ignoren certificados.

Resultados:
- Una ventana visible abrió la página local de prueba. La herramienta de control Windows no pudo enlazarse a la ventana: error contradictorio de identidad Chrome/Chromium. No se afirma interacción visual automatizada satisfactoria.
- Mediante el protocolo de pruebas de Chromium se crearon dos pestañas y se verificaron sus URLs.
- Descarga desde un servidor local: evento `Browser.downloadProgress` con `state=completed`, 28 bytes; contenido exacto `Senda download verification\n` en `.profiles/senda-functional/downloads/senda-test.txt`.
- El primer intento de descarga falló porque la ruta del protocolo usó separadores no nativos. Tras normalizarla a Windows, terminó correctamente. No se cambió el navegador para superar esa prueba.
- Marcador creado usando la API de Chromium desde `chrome://bookmarks`, identificador 5, título `Senda - verificacion persistente`.
- Cierre limpio mediante `Browser.close`, reinicio del mismo perfil: `chrome.bookmarks.get("5")` recuperó el marcador y `localStorage.getItem("senda-proof")` devolvió `persisted`.
- Navegador de pruebas y servidor local cerrados al terminar.

Límites: el marcador se probó por API, no mediante el diálogo visual. Las comprobaciones no cubren extensiones de terceros, estabilidad prolongada ni mejoras de RAM. Persisten los avisos de depuración de la prueba anterior.
