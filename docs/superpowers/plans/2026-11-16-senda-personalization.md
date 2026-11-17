# Personalización de Senda

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Ejecución en este chat, con un solo agente.

**Goal:** personalizar inicio, barra y pestañas, según la selección de Luis.

**Architecture:** conservar la página propia y su almacenamiento compatible v1; conectar un adaptador Mojo limitado a ThemeService para la apariencia real del navegador. No aplicar preferencias nativas al cargar: leer el tema existente y cambiarlo solo al guardar.

**Tech Stack:** TypeScript, CSS, HTML, Mojo y C++ de Chromium.

**Spec:** ../specs/2026-10-31-senda-design.md (diseño aprobado; detalles visuales delegados).

## Restricciones y revisión

- Cinco paletas locales: azul, bosque, arcilla, violeta y pizarra; tipografía Segoe UI existente, sin descargas de fondos o fuentes.
- Fondos liso, bruma y líneas, accesos cómodos o compactos y visibilidad opcional.
- Vista previa solo del inicio; Guardar aplica también a barra y pestañas. Cancelar/Escape restaura el inicio.
- Mantener accesos y buscador anteriores; validar preferencias corruptas y sincronizar pestañas abiertas.
- Respetar temas existentes al abrir, y restricciones administrativas al guardar.

## Pasos

- [x] Añadir y ejecutar pruebas de migración, normalización y persistencia de las opciones nuevas.
- [x] Implementar controles, vista previa reversible, fondos y distribución en ui/new-tab/.
- [x] Añadir adaptador nativo y métodos Mojo limitados para leer/aplicar ThemeService; exportar parche incremental 0007.
- [x] Compilar con cuatro tareas y comprobar reproducción de todos los parches.
- [x] Probar en Senda: guardar, cancelar, Escape, reinicio, sincronización y colores nativos; revisar escritorio y ancho estrecho.
- [x] Registrar resultados y límites reales y crear commit local.

Resultados: [informe de validación](../../validation/2026-11-16-personalization.md).
