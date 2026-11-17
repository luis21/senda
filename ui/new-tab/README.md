# Inicio de Senda

Fuentes: HTML, CSS, dos módulos TypeScript de inicio y el adaptador nativo `senda_appearance.ts`. Los `.js` son salida generada para una vista previa local y no se versionan. Chromium compila los `.ts` mediante `build_webui` y su política estricta de tipos.

Las pruebas `node --test tests/new-tab-state.test.mjs` compilan las fuentes estrictamente a `.tools/home-tests` antes de validar comportamiento. Requieren las dependencias de desarrollo ya descargadas de Chromium.

Para generar los módulos de la vista previa, desde la raíz del proyecto:

```powershell
node .chromium/src/third_party/node/node_modules/typescript/bin/tsc --target ESNext --module ESNext --moduleResolution bundler --lib DOM,DOM.Iterable,ESNext --strict --noUncheckedIndexedAccess --noPropertyAccessFromIndexSignature --skipLibCheck --outDir ui/new-tab ui/new-tab/senda_home.ts ui/new-tab/senda_home_state.ts
```

El parche 0002 contiene la integración inicial; 0007 amplía la personalización y conecta ThemeService mediante Mojo. 0008 añade el inicio de mosaicos y la bienvenida. Mantener las copias empaquetadas iguales a estas fuentes y actualizar el parche correspondiente.

«Personalizar» permite elegir apariencia del sistema/clara/oscura y cinco colores para la barra y las pestañas. Los fondos liso, bruma y líneas se dibujan con CSS local. El inicio admite accesos cómodos o compactos y ocultarlos sin borrarlos. Cambiar los controles muestra una vista previa del inicio; Guardar aplica la apariencia nativa. Cerrar, Cancelar o Escape descarta esa vista previa.

El adaptador solo se carga en `chrome://`; en una vista previa web el color afecta únicamente al inicio. Al abrir Senda se lee el tema nativo existente, sin sobrescribirlo. Las restricciones administrativas deshabilitan los controles nativos. Las opciones del inicio siguen en `senda.home.v1` y conservan los accesos de perfiles anteriores.

El inicio presenta hasta 48 mosaicos, con seis columnas cómodas a ancho amplio y dos en móvil. Usa favicons de la caché local `chrome://favicon2/`, con `allowGoogleServerFallback=0`; si falta el icono, muestra la inicial del título. No visita automáticamente los sitios añadidos. El fondo inicial «Pliegues» usa el SVG local; los fondos anteriores se conservan si ya estaban elegidos.

La bienvenida aparece inicialmente. «Empezar a navegar» guarda la casilla «Ocultar bienvenida y novedades». También puede ocultarse desde Personalizar en esa primera visita. Desactivar la casilla y guardar vuelve a mostrarla; mientras esté desactivada aparece en nuevas pestañas. «Novedades» permite abrirla manualmente. Su contenido describe las funciones incluidas en esta versión y se actualiza con el código del navegador, sin un servicio remoto.
