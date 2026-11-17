# Inicio con mosaicos, bienvenida e identidad

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Ejecutar con un solo agente y revisión independiente al completar la función.

**Goal:** adaptar el inicio a la referencia de Opera, añadir bienvenida/novedades y reemplazar el icono visible de Chromium.

**Spec:** ../specs/2026-10-31-senda-design.md; referencia y alcance indicados por Luis en este chat. Los detalles visuales están delegados al implementador.

**Architecture:** mantener la nueva pestaña nativa y sus preferencias compatibles. Mosaicos de hasta 48 sitios, iconos de la caché local de Chromium y monogramas como respaldo. Bienvenida como vista completa del inicio, primera visita y acceso manual; un interruptor persistente «Ocultar bienvenida y novedades» controla su apertura automática. Reutilizar el símbolo de ruta de Senda en SVG y recursos Windows multirresolución; integrar sus binarios mediante un parche Git reproducible.

**Tech Stack:** HTML/CSS/TypeScript, SVG local, recursos PNG/ICO de Windows y Chromium build_webui.

## Diseño

Fondo azul hielo #c6d8e4 con pliegues originales en SVG, superficies #ffffff, texto #20394d, acento Senda #285db5 y oscuro #162332. Segoe UI local. Buscador centrado de 640px, seis columnas de mosaicos de 144 × 90px a ancho amplio y dos en móvil. Las etiquetas van debajo del mosaico. Barra superior discreta con marca, Novedades y Personalizar. Conservar fondos y paletas existentes; añadir «Pliegues» como valor inicial para perfiles nuevos. Sin fotografías, fuentes remotas, enlaces patrocinados ni descarga de favicons a terceros.

La bienvenida presenta las capacidades existentes (protección nativa, ahorro de memoria y personalización) sin cifras o garantías no verificadas. Botón «Empezar a navegar» y casilla para ocultarla. Desactivar la casilla desde Personalizar vuelve a abrirla al guardar; puede abrirse manualmente desde Novedades. Ocultarla conserva accesos, buscador y tema.

## Trabajo y validación

- [x] Pruebas de migración, límite 48 y reglas de visibilidad de bienvenida; observar fallo antes de implementar.
- [x] Implementar mosaicos, fondo y bienvenida en ui/new-tab; conservar CRUD, teclado, temas y ancho estrecho.
- [x] Crear assets/branding/senda.svg, generador y recursos Windows; comprobar tamaños e icono del ejecutable.
- [x] Exportar parches 0008/0009, verificar reproducción y compilar con cuatro tareas.
- [x] Probar primera visita, ocultación, reapertura, reinicio, búsqueda y mosaicos; inspeccionar ventana e icono reales.
- [x] Registrar evidencia y límites, revisión y commit local, sin publicar.

Evidencia y límites: [validación](../../validation/2026-11-16-speed-dial-welcome.md).
