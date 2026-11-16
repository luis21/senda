# Inicio nativo de Senda

Tramo del hito 2 autorizado por Luis al pedir continuar con la página de inicio. Se conserva Chromium directo y la página se empaqueta dentro del navegador, sin servidor externo ni extensión.

Diseño: fondo azul pálido #F2F6FC, texto pizarra #1D2D44, acento azul #285DB5, superficies blancas #FFFFFF y borde #CCD8E8; oscuro con base #182231 y texto #E5EDF8. Tipografía local Segoe UI Variable/Segoe UI, marca con peso ligero y espacio amplio. Buscador central con un único foco visual, accesos mediante monogramas locales y personalización en diálogo nativo. Sin imágenes, fuentes remotas, noticias ni métricas inventadas.

Alcance: búsqueda DuckDuckGo predeterminada en esta página, opciones Google/Bing, temas sistema/claro/oscuro y hasta doce accesos editables. Preferencias locales por perfil; entrada inválida y almacenamiento inaccesible producen mensajes claros. La selección del buscador de la página no cambia todavía el de la barra de direcciones.

Archivos canónicos: `ui/new-tab/senda_home.html`, `senda_home.css`, `senda_home.ts`, `senda_home_state.ts`. La copia de integración sustituye `chrome/browser/resources/new_tab_page/new_tab_page.html`, añade CSS a `static_files` y los módulos a `ts_files` del BUILD.gn existente. Los `.js` de la vista previa se generan con TypeScript y no se versionan. Mantener el controlador y las políticas de seguridad de Chromium. No introducir código inline ni debilitar Trusted Types.

Verificación:
- Pruebas Node de URLs permitidas, normalización de estado, límites y persistencia fallida.
- Pruebas de navegador: búsqueda codificada, añadir/editar/eliminar acceso, rechazo javascript:, persistencia al recargar, tema, diseño a 1440 y 390 píxeles.
- Exportar parche de integración y compilar incrementalmente con cuatro tareas cuando termine la compilación de títulos. No editar los recursos que usa una compilación todavía activa.
- Verificar nueva pestaña nativa tras compilar; una vista previa local no demuestra integración.

Pendientes de etapas posteriores: icono de Windows, paleta de las pestañas nativas, nueva pestaña de proveedores terceros y privacidad/bloqueo. No se declara ahorro de RAM por simplificar esta página: se medirá por separado.
