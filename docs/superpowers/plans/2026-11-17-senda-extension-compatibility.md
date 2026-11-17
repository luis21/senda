# Verificación de extensiones y plataforma web

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Un agente para implementar y una revisión independiente final.

**Goal:** cerrar un primer bloque reproducible del pendiente de compatibilidad con extensiones y páginas web.

**Spec:** ../specs/2026-10-31-senda-design.md, apartados Extensiones y compatibilidad / Validación. No equivale a probar todas las extensiones ni Chrome Web Store.

**Architecture:** servidor HTTP de loopback, perfiles desechables nuevos y una extensión Manifest V3 propia limitada a 127.0.0.1. Usar el navegador ya compilado, su subsistema real de extensiones y el transporte CDP existente. No cambiar seguridad, perfil personal ni configuración global de Windows. Los fixtures se copian antes de actualizarse; nunca modificar sus fuentes versionadas durante una ejecución.

**Tech Stack:** Node incluido en Chromium, JavaScript, Manifest V3, CDP y APIs web nativas.

## Casos y restricciones

- Baseline sin extensión: el recurso que bloqueará DNR llega al servidor, no hay inyección y el bloqueo nativo de anuncios sigue activo.
- Con extensión: content script, mensajes con service worker, almacenamiento, límites de permisos y DNR reversible; distinguir el bloqueo de extensión del nativo por sus URLs y contadores.
- Detener el worker en el perfil de prueba y comprobar su reactivación con una identidad distinta y almacenamiento conservado.
- Actualizar la copia local de la extensión sin ampliar permisos y comprobar versión, inyección y estado anterior; reiniciar el navegador y repetir.
- Plataforma web: módulos/importación dinámica, WebAssembly, IndexedDB, CacheStorage, service worker y Canvas. No solicitar cámara, micrófono ni credenciales reales.
- Informes JSON fuera de Git bajo `.tools/`, resumen verificable y límites en docs/validation. Cerrar siempre navegador y servidor; conservar los perfiles como artefactos aislados, sin borrados recursivos.

## Registro de decisiones

- La recarga inicial falló con `DISABLE_UNSUPPORTED_DEVELOPER_EXTENSION` (1 << 24), confirmado en los datos del perfil sintético y en Chromium. Habilitar el modo desarrollador solo en ese perfil, requisito normal para actualizar una extensión sin empaquetar; conservar todas las comprobaciones del navegador.
- Chromium protege ese ajuste contra la modificación directa del archivo de preferencias. Activarlo mediante la misma API nativa que utiliza chrome://extensions; no alterar hashes ni deshabilitar la protección. Comprobar después del reinicio que se conserve por el camino normal.
- Verificar permisos con lecturas reales desde el worker: 127.0.0.1 autorizado y localhost sin permiso, ambos con respuestas sin CORS y contadores del servidor. La consulta de permisos por sí sola no demuestra su aplicación.

## Pasos

- [x] Crear fixtures y comprobador con controles positivos/negativos y perfiles estrictamente delimitados.
- [x] Ejecutar baseline y extensión en Senda, investigar fallos y repetir solo los casos afectados.
- [x] Comprobar reinicio y actualización, revisar el código y resolver hallazgos.
- [x] Documentar resultados y pendientes reales; commit local sin publicar.

## Resultado y decisiones

Pruebas de la extensión aprobadas; baseline web con reinicio aprobado. Batería conjunta en FAIL por la interceptación del service worker web tras reiniciar: mismo resultado en Chrome for Testing 156.0.8078.80. No se declara resuelto el pendiente global de compatibilidad. Evidencia: [validación](../../validation/2026-11-17-compatibility.md).

Ruling: conservar el fallo como regresión abierta, sin alterar el motor ni desactivar controles de seguridad para obtener un PASS. La reproducción oficial impide atribuirlo exclusivamente a Senda; todavía falta aislar si pertenece al motor, al modo headless o al escenario del comprobador. Coste: este caso sigue sin aprobarse. El commit contiene el comprobador y la evidencia del fallo, no una corrección supuestamente aprobada.

Revisión independiente: corregido el hallazgo sobre permisos mediante lecturas reales autorizadas y no autorizadas, con contadores del servidor. Pasaron en las ejecuciones finales. Cierre de navegador y servidor comprobado tanto en PASS como en FAIL. No se recompiló ni modificó el código nativo del navegador.

Fuentes primarias consultadas: [ciclo de service workers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle), [declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest).
