# Protección de Senda: primera capa nativa

Implementación autorizada por Luis al pedir continuar con los pendientes. Se mantiene la arquitectura Chromium y se ejecuta en esta sesión con un agente.

## Decisión técnica

Reutilizar `components/subresource_filter` y su índice nativo de patrones, mantenidos en Chromium, para la primera capa de bloqueo de solicitudes. Comparados: adblock-rust (MPL-2.0, requiere incorporar Rust/FFI y dependencias adicionales), Ghostery (MPL-2.0, motor JavaScript) y el motor ya presente. El motor existente permite conservar distribución de reglas a renderers, filtrado de subframes y excepciones de ADS. No se asumirá compatibilidad con toda la sintaxis de EasyList.

Fuentes de reglas: EasyList y EasyPrivacy oficiales, con atribución y licencia CC BY-SA 3.0 de sus autores. La conversión debe documentar reglas aceptadas, descartadas y formatos no soportados; no presentar compatibilidad completa si hay descartes.

## Entrega comprobable

1. Compilar herramientas nativas de conversión/prueba; descargar instantáneas oficiales versionadas y verificar conversión.
2. Empaquetar una instantánea como recurso del navegador, con manifiesto y licencia en la fuente de distribución. Activar el filtro nativo en todos los sitios HTTP/HTTPS por defecto, conservando excepciones existentes por sitio y Safe Browsing.
3. Validar manifiesto y SHA-256 antes de copiar los datos al checkout; el navegador obtiene el recurso mapeado y usa su hash como versión segura. RulesetService lo indexa y publica en segundo plano, conservando la última versión válida si falla la indexación. No se leen rutas de un manifiesto remoto en el navegador.
4. Evitar que el componente de reglas publicitarias de Google sustituya las listas de Senda. Conservar las actualizaciones de protección contra malware y phishing.
5. Ajustar cookies de terceros y sugerencias de búsqueda con valores predeterminados de privacidad, respetando preferencias explícitas. Auditar valores ya desactivados antes de atribuir cambios nuevos.
6. Pruebas reales con servidor local: recurso publicitario y rastreador bloqueados por defecto, recurso legítimo permitido, excepción por sitio que recupera recursos y datos persistentes. Comprobar reglas corruptas y que Safe Browsing siga activo.

La primera navegación HTTP/HTTPS espera publicación de un índice verificado, con límite de 30 segundos y error explícito si no está disponible. Las páginas internas y excepciones explícitas siguen accesibles. La recuperación de un índice persistido corrupto reintenta la instantánea empaquetada en la misma sesión. La prueba abre directamente la URL al arrancar, sin espera previa para preparar reglas. Los avisos de Better Ads solo afectan al modo ACTIVATION_LIST y no desactivan el filtro ALL_SITES.

## Archivos previstos

- `third_party/easylist/`: fuentes, licencia y manifiesto de procedencia.
- `assets/filters/`: instantánea convertida, licencia y manifiesto para distribución de desarrollo.
- `tools/`: preparación y validación de instantáneas.
- Cambios mínimos en `subresource_filter_features.cc`, creación de RulesetService en `browser_process_impl.cc`, registro del componente de anuncios y recursos GRIT. `third_party/senda_filter_lists` en el checkout se genera desde `assets/filters` con licencia y README.chromium.
- `patches/0003-senda-network-protection.patch` y pruebas/reportes concretos.

## Límites que no se darán por cumplidos con esta capa

Filtrado cosmético, panel propio con contador por sitio y actualización automática de listas requieren implementación posterior. Esta primera entrega se marcará como bloqueo de red parcial, no como bloqueador completo. Los avisos y excepciones de la primera versión utilizarán la interfaz nativa existente de anuncios.

Las mejoras de RAM se medirán en un hito separado; reutilizar un índice nativo no demuestra por sí solo un ahorro respecto a Chrome.
