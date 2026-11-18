# Instalador de Senda para Windows x64

Luis pidió terminar las actualizaciones de listas y crear el instalador. Se construirá una versión Release independiente de Visual Studio. La elección Release es una decisión del implementador: la compilación Dev existente utiliza CRT de depuración no redistribuible. Se ofreció como alternativa un paquete estrictamente de pruebas; mientras no se indique lo contrario se prepara el instalador independiente.

Actualización autorizada por Luis: «Crear primero el instalador de pruebas para mi PC». La primera entrega usa `-PersonalDev`, identidad de instalación separada y marca `redistributable: false`. Incluye las dependencias Debug solo para pruebas en el equipo del propietario, conserva el perfil y no se presenta como instalador Release para distribución. La compilación Release y su validación quedan como alcance posterior.

- Chromium fijado en `config/chromium.json`, parches actuales y cuatro tareas. Salida separada `out/SendaRelease`, sin modificar la compilación Dev.
- Release no oficial, sin símbolos, PGO ni ThinLTO; no representa una versión pública estable ni dispone de certificado de firma.
- Empaquetado NSIS Unicode, por usuario, Windows x64, nombre e icono Senda. Directorio inicial `%LOCALAPPDATA%/Programs/Senda`; accesos al menú Inicio y escritorio opcional. No fuerza el navegador predeterminado.
- El perfil predeterminado permanece en `%LOCALAPPDATA%/Senda/User Data`, fuera de los archivos de programa. Desinstalar conserva perfiles y archivos ajenos al manifiesto.
- El paquete se deriva de las dependencias de ejecución de GN: sin PDB, bibliotecas de enlace ni archivos del checkout o perfiles. Se incluyen `chrome.exe` y su alias idéntico `Senda.exe`, recursos, DLL necesarias y licencias.
- Se rechazan compilaciones incompletas, revisión/parches discrepantes, rutas que escapen de la salida y CRT de depuración. El manifiesto conserva hashes de cada archivo y del instalador.
- Un modo de verificación usa registro y directorio exclusivos del proyecto. Debe instalar silenciosamente, ejecutar Senda desde el destino, comprobar recursos y protección, desinstalar y conservar archivos ajenos/perfil.

La distribución permite probar Senda sin instalar Visual Studio. Los requisitos de actualización del ejecutable y firma digital siguen fuera de este primer instalador. Las actualizaciones de listas ya están implementadas.

Fuentes: [NSIS](https://nsis.sourceforge.io/), [restricciones de CRT Debug de Microsoft](https://learn.microsoft.com/en-us/cpp/windows/preparing-a-test-machine-to-run-a-debug-executable?view=msvc-170).
