# Senda: diseño inicial para Windows

Estado: aprobado por Luis el 2026-10-31. Implementación de desarrollo en curso; compilación base y primeras funciones verificadas en `docs/validation/`. El alcance completo todavía no está terminado.

## Intención y decisiones acordadas

Crear Senda, un navegador de escritorio basado directamente en Chromium y exclusivo de Windows en su primera versión. Combina privacidad, bloqueo integrado de anuncios y rastreadores, compatibilidad con extensiones, integración con Windows, menor consumo de memoria y diseño atractivo.

El usuario aceptó temas claro y oscuro, pestañas fáciles de distinguir, animaciones discretas y una página de inicio personalizable.

## Enfoques considerados

1. Adaptar Chromium directamente: permite modificar las funciones del navegador, conservando su arquitectura y compatibilidad. Exige compilar una base grande y mantener actualizaciones de seguridad. Es la opción elegida por el usuario.
2. Integrar un motor Chromium en otra aplicación: acelera el desarrollo inicial, pero condiciona el soporte de extensiones y el control del motor. Descartado para esta propuesta.

## Alcance propuesto para la primera versión

Estas decisiones concretas son propuestas del implementador, no acuerdos adicionales del usuario.

- Windows 11 x64 como primer objetivo de compilación y prueba. Otras versiones y ARM64 quedan para una etapa posterior.
- Navegación con pestañas, barra de direcciones, historial, marcadores, descargas, perfiles locales y ventanas privadas sobre las funciones existentes de Chromium.
- Identidad Senda en nombre, icono y superficies principales. Interfaz limpia, temas del sistema/claro/oscuro y accesibilidad mediante teclado, contraste y escalado.
- Inicio local con buscador y accesos editables; sin noticias ni servicios de contenido en segundo plano. DuckDuckGo como buscador inicial propuesto, con opción de cambiarlo.
- Sin cuenta Senda ni sincronización remota inicialmente.

## Privacidad y bloqueo

- Bloqueador integrado y activo por defecto, independiente de una extensión instalada por el usuario. Debe filtrar solicitudes y ocultar elementos publicitarios mediante reglas cosméticas, con listas de anuncios y rastreadores actualizables.
- Reutilizar una implementación mantenida y compatible con las licencias del producto; seleccionar biblioteca, listas y sus licencias durante la investigación técnica previa a la implementación.
- Panel por sitio con estado, solicitudes bloqueadas y excepción reversible. Un contador describe solicitudes bloqueadas, no demuestra ausencia de seguimiento.
- Proponer modo equilibrado por defecto y modo estricto opcional. Conservar las protecciones de seguridad y el aislamiento de Chromium.
- Sin telemetría propia ni envío automático de informes de fallos. Auditar conexiones heredadas y documentar las que se conserven, incluyendo actualizaciones, listas y protección contra sitios maliciosos.
- No prometer anonimato, eliminación de todas las huellas ni bloqueo universal de anuncios. Verificar almacenamiento, cookies y permisos sin romper indiscriminadamente sitios.

## Extensiones y compatibilidad

- Conservar el subsistema de extensiones y permisos de Chromium. No garantizar compatibilidad con todas las extensiones ni asumir acceso automático a Chrome Web Store.
- Verificar instalación, actualización y permisos con un conjunto pequeño de extensiones representativas. La disponibilidad de la tienda y sus condiciones se resuelven en la investigación técnica.
- No incluir soporte de servicios exclusivos de Chrome o Edge por suposición. DRM, códecs con licencias y servicios de Google requieren evaluación separada.

## Memoria y rendimiento

- Aprovechar y adaptar la gestión de pestañas inactivas de Chromium antes de introducir mecanismos propios. Mostrar pestañas suspendidas y permitir excluir sitios.
- Evitar suspensión durante reproducción multimedia, llamadas, descargas o trabajo sin guardar cuando sea detectable. Restaurar navegación y estado con las garantías disponibles en Chromium; no prometer preservar cualquier formulario.
- Reducir procesos y servicios opcionales en segundo plano sin desactivar sandbox, aislamiento de sitios ni protecciones equivalentes para ahorrar RAM.
- Medir todo el árbol de procesos en Windows, con el mismo hardware, páginas, versiones del motor comparables y extensiones en ambos navegadores. Comparar reposo, navegación activa, múltiples pestañas y reactivación; registrar memoria privada, CPU y latencia.
- El objetivo es consumir menos memoria que Chrome en escenarios reproducibles con muchas pestañas inactivas. No se fija un porcentaje sin línea base. Publicar resultados aunque no favorezcan a Senda.

## Integración con Windows y distribución

- Instalación y desinstalación, accesos directos, asociaciones HTTP/HTTPS y registro como candidato a navegador predeterminado respetando la elección del usuario.
- Primera entrega técnica: compilación local de desarrollo, ejecutable y reproducible; no se considera lista para uso diario.
- Antes de una entrega pública: instalador, firma de código, mecanismo de actualización verificable con recuperación ante fallos y proceso para incorporar parches de Chromium. Certificados, infraestructura y costes externos requieren decisiones posteriores; no se asume que existan.

## Arquitectura y restricciones

- Mantener un conjunto pequeño y documentado de cambios sobre Chromium para facilitar actualizaciones. Separar identidad/interfaz, configuración de privacidad, bloqueo y distribución en componentes revisables.
- Usar las herramientas y lenguajes nativos del código de Chromium. No añadir un contenedor Electron.
- Antes de descargar el árbol completo, comprobar requisitos oficiales vigentes y disponibilidad local de compilador, SDK, disco y memoria. Documentar impedimentos reales; no dar por hecha la capacidad de compilar en este equipo.
- Revisar licencias de Chromium y componentes incorporados, atribuciones y uso de marcas. Senda tiene identidad propia.

## Validación y límites de entrega

1. Compilación de desarrollo que abre páginas HTTPS, crea pestañas y conserva datos de perfil tras reiniciar.
2. Pruebas de bloqueo reproducibles con solicitudes controladas, reglas cosméticas, excepciones y actualización de listas; navegación en una muestra de sitios para detectar roturas.
3. Verificación de extensiones representativas, ventanas privadas, permisos y conexiones salientes.
4. Comparación de memoria y capacidad de reactivar pestañas; revisión visual y de accesibilidad en temas claro y oscuro.
5. Una versión pública exige además verificar instalación, actualización y mantenimiento de seguridad. La apariencia terminada no basta.

No forman parte de la primera versión: otros sistemas operativos, sincronización en la nube, VPN, antivirus propio, asistente de IA, servicios exclusivos de otros navegadores ni garantías de reducción de memoria no medidas.

## Decisiones delegadas al implementador

Elegir revisión estable de Chromium y organización de parches, herramientas de compilación compatibles, biblioteca de bloqueo y listas tras verificar licencias, detalles de diseño visual, umbrales de inactividad y conjunto de pruebas. Si la investigación revela un impedimento que cambie los requisitos aceptados, presentarlo antes de sustituir la arquitectura.
