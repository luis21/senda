# Senda: confirmación del control de protección

Fecha local: 2026-11-16. Rama `codex/cosmetic-protection`; continuación de la validación cosmética del 15 de noviembre.

## Diagnóstico y cambio

Se reprodujo en un perfil de prueba el fallo de etiqueta: al marcar «Desactivar protección en este sitio», el botón inferior conservaba «Aceptar». El modelo actualizaba su texto, pero la vista solo notificaba un cambio y conservaba la etiqueta anterior de `DialogDelegate`.

Confirmar con el botón del propio panel sí guardaba la excepción y recargaba. Se observaron anuncios visibles y la solicitud controlada permitida. Esto distingue el guardado del problema de presentación.

La vista ahora utiliza `SetButtonLabel` con el texto actualizado del modelo. Ese método ya notifica a la vista; no se añade una segunda notificación. La prueba C++ `CheckboxUpdatesVisibleDoneButton` cubre ambos cambios de texto al marcar y desmarcar.

También se corrigió la sincronización de filtros: solo escribe archivos cuyo contenido cambió. Antes, copiar de nuevo `CosmeticExceptions.inc` sin cambios obligaba a recompilar el consumidor de Blink. Una prueba RED/GREEN con archivos reales verifica conservación de fechas y copia de una instantánea modificada.

## Verificación

- Pasan 16 pruebas Python y la prueba Node del transporte CDP.
- Los seis parches se reproducen sobre 50 archivos y coinciden con el checkout.
- Compilación aprobada con cuatro tareas: siete pasos, 7m22s. La siguiente invocación, con filtros idénticos, terminó con **cero pasos** en 35,96s.
- Comprobación de fechas en los cinco archivos reales de filtros aprobada; no cambia el hash de la instantánea ni se evita su validación.

| Acción en el panel y comprobación | Resultado |
|---|---|
| Marcar la casilla | El botón muestra «Volver a cargar» |
| Desmarcar la casilla | El botón vuelve a «Aceptar» |
| Confirmar desactivación | Se recarga; anuncio/rastreo permitidos y elemento visible |
| Reiniciar sin preparar preferencias | Se conserva la excepción y el panel muestra desactivado |
| Confirmar reactivación | Se recarga; anuncio/rastreo bloqueados y elemento oculto |
| Solicitud tardía y trabajador tras reactivar | Ambos bloqueados |
| Segundo reinicio, mismo origen | Se conserva la protección activa y el bloqueo de red/CSS |

En el estado desactivado, `good/ad/tracker/display` fue `true/true/true/block`; después de reactivar y tras el segundo reinicio, `true/false/false/none`. Los recursos legítimos se conservaron en ambos casos. La regresión adicional pasó IDs/clases, mutaciones, clones, plantillas, excepciones cosméticas por dominio/URL, cookies de terceros, sugerencias y Safe Browsing.

Para verificar persistencia sin preparar de nuevo la preferencia, la prueba de navegador admite `--expect-allowed` y `--port=N`. El puerto se conserva porque la excepción corresponde al origen. El probe `state` comprueba recursos legítimos, anuncios, rastreo y ocultación CSS tras cada cambio.

La suite C++ completa sigue sin ejecutarse; la prueba añadida no se presenta como aprobada. Se utiliza un perfil aislado y un servidor local, sin modificar perfiles personales, protección de Windows ni políticas globales.

Una primera ejecución GUI no recibió la página local dentro de la espera de prueba; no se repitió en las ejecuciones posteriores. El diagnóstico ahora incluye URL y título para distinguir errores de navegación de fallos de filtrado.

Registros locales (excluidos de Git): `.tools/build-panel-save-fix-20261116.log`, `.tools/build-panel-noop-20261116.log`, `.tools/panel-save-green-20261116.log`, `.tools/panel-save-restart-{allowed,enabled}-20261116.log` y `.tools/panel-save-regression-20261116.log`. El perfil `.profiles/panel-save-green-20261116` se cerró al terminar.
