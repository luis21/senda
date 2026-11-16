# Senda: filtrado cosmético y controles por sitio

Diseño de referencia: `../specs/2026-10-31-senda-design.md`, aprobado. Rama: `codex/cosmetic-protection`.

Se reutiliza el checkout y la compilación existentes: duplicar Chromium excedería el espacio disponible. Las entregas reproducibles son los parches y archivos del repositorio de Senda.

## Alcance y decisiones

Conectar el índice cosmético nativo de Chromium a Blink. Consultar reglas por dominio y por clases/identificadores observados; inyectar CSS de usuario agrupado y deduplicado, sin extensión ni JavaScript de contenido. Respetar las excepciones cosméticas y la excepción de protección por sitio. Omitir y contabilizar sintaxis no compatible antes de compilar la lista. No usar selectores procedurales propios de otras extensiones.

Ampliar el control nativo de anuncios de la barra para mostrar protección, solicitudes bloqueadas y excepción reversible. Mantener el aislamiento por página y las protecciones de navegación de Chromium. El contador describe solicitudes, no elementos ocultos ni rastreadores identificados.

## Tareas y comprobación

- [x] Pruebas RED: preparación segura de reglas, ocultación estática/dinámica, contenido legítimo y excepción por sitio.
- [x] Instantánea con reglas cosméticas compatibles, ordenadas para conservar excepciones; procedencia, licencia y hashes actualizados.
- [x] Conexión nativa a Blink con CSS de usuario, consultas acotadas y procesamiento agrupado.
- [x] Control nativo por sitio con contador y excepción reversible.
- [x] Parche reproducible, compilación con cuatro tareas y pruebas reales de red/cosmética/excepciones.
- [x] Documentar resultados y límites; revisar el cambio completo y dejar el estado verificable.

No se incluye en este hito actualización automática de listas, instalador/firma, auditoría completa de conexiones ni comparación con Chrome comercial.

## Resoluciones y revisión

- Se aisló la cosmética en un suplemento de `Document` para evitar modificar cabeceras compartidas de Blink. Tras restaurar las cabeceras originales byte por byte, se invalidaron los cinco objetos intermedios compilados con el intento anterior. La compilación cosmética quedó en 19 pasos (7m54s).
- La revisión independiente encontró dos problemas: activaciones `$generichide` omitidas por el conversor antiguo y nodos adoptados desde documentos inertes. Ambos se reprodujeron en el navegador antes de corregirse.
- Las 167 excepciones actuales se representan con 183 dominios, dos prefijos y seis subcadenas de URL; ninguna necesita el fallback global. Se conserva el origen precursor para documentos opacos. Las restricciones se amplían conservadoramente cuando no se representa toda su sintaxis.
- `DidMoveToNewDocument` vuelve a observar nombres de los nodos adoptados. El código corregido recibió una segunda revisión estática sin nuevos problemas importantes.
- El panel se inspeccionó en Windows con una copia idéntica del ejecutable llamada `senda.exe`; la herramienta confundía `chrome.exe` con Chrome. Se observaron contadores 2 → 3 tras una solicitud tardía y 2 después de navegar, con cierre automático del panel anterior.
- La compilación final terminó en 1m41s (siete pasos); pasaron los casos corregidos, recuperación del índice, detención si no está disponible, valores de privacidad y configuración de memoria. Pasaron 15 pruebas Python y la prueba CDP. La reproducción de seis parches sobre 48 archivos coincide con las fuentes compiladas.
- La revisión visual posterior se detuvo por `GetCursorPos: acceso denegado`. El estado desactivado/cero y la ejecución del control reversible quedan explícitamente pendientes en el informe. Las suites C++ completas no se han ejecutado.
- Los cambios quedan en la rama local `codex/cosmetic-protection`; no se solicitó fusionar ni publicar esta rama.
