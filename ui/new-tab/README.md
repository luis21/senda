# Inicio de Senda

Fuentes: HTML, CSS, dos módulos TypeScript de inicio y el adaptador nativo `senda_appearance.ts`. Los `.js` son salida generada para una vista previa local y no se versionan. Chromium compila los `.ts` mediante `build_webui` y su política estricta de tipos.

Las pruebas `node --test tests/new-tab-state.test.mjs` compilan las fuentes estrictamente a `.tools/home-tests` antes de validar comportamiento. Requieren las dependencias de desarrollo ya descargadas de Chromium.

Para generar los módulos de la vista previa, desde la raíz del proyecto:

```powershell
node .chromium/src/third_party/node/node_modules/typescript/bin/tsc --target ESNext --module ESNext --moduleResolution bundler --lib DOM,DOM.Iterable,ESNext --strict --noUncheckedIndexedAccess --noPropertyAccessFromIndexSignature --skipLibCheck --outDir ui/new-tab ui/new-tab/senda_home.ts ui/new-tab/senda_home_state.ts
```

El parche 0002 contiene la integración inicial; 0007 amplía la personalización y conecta ThemeService mediante Mojo. Mantener las copias empaquetadas iguales a estas fuentes y actualizar el parche correspondiente.

«Personalizar» permite elegir apariencia del sistema/clara/oscura y cinco colores para la barra y las pestañas. Los fondos liso, bruma y líneas se dibujan con CSS local. El inicio admite accesos cómodos o compactos y ocultarlos sin borrarlos. Cambiar los controles muestra una vista previa del inicio; Guardar aplica la apariencia nativa. Cerrar, Cancelar o Escape descarta esa vista previa.

El adaptador solo se carga en `chrome://`; en una vista previa web el color afecta únicamente al inicio. Al abrir Senda se lee el tema nativo existente, sin sobrescribirlo. Las restricciones administrativas deshabilitan los controles nativos. Las opciones del inicio siguen en `senda.home.v1` y conservan los accesos de perfiles anteriores.
