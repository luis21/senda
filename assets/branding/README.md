# Identidad visual de Senda

`senda.svg` conserva el símbolo de ruta utilizado en la interfaz: una S blanca con dos puntos sobre una base azul. Es un diseño del proyecto, independiente del icono de Chromium. El fondo de pliegues de `ui/new-tab/senda_wallpaper.svg` también es un SVG original local.

`tools/Generate-SendaIcons.ps1` genera en Windows las imágenes PNG de 16 a 256 píxeles, un ICO con nueve tamaños y las marcas de texto para escalas 100/200%. Usa System.Drawing y Segoe UI local, sin descargas ni dependencias adicionales. El SVG y la geometría equivalente del generador deben mantenerse coordinados.

El parche `0009-senda-windows-icons.patch` contiene las copias de los recursos del ejecutable, lista de aplicaciones, logotipos internos y favicon de Nueva pestaña. Las variantes `ntp-16.png` y `ntp-32.png` conservan el fondo transparente porque Chromium aplica un tinte monocromo al favicon. Al regenerar los assets, actualizar también ese parche; `tests/verify-built-icon.py` comprueba que el icono principal del ejecutable contiene exactamente los PNG de esta carpeta. `ui/new-tab/senda_icon.svg` debe coincidir con el SVG maestro.

El icono de incógnito conserva su indicador propio. Este conjunto cubre la compilación Windows de desarrollo; no incluye un paquete de instalación ni iconos para macOS.
