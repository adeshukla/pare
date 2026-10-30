import type { Strings } from '../i18n';

/** Loaded only on pages in this language (ADR-041). */
const es: Strings = {
  langName: 'Español',
  language: 'Idioma',
  privacyChip: 'Nada sale de esta pestaña',
  worksOffline: 'Funciona sin conexión',

  heroChip: 'Imágenes · fuentes · código · sitios completos',
  taskChip: 'Gratis · privado · funciona sin conexión',
  heroHeading: ['Haz tus archivos', 'ligeros.'],
  heroLede:
    'Reduce tus imágenes, fuentes y código, y obtén el código para usarlos. Los archivos se leen en esta pestaña y nunca se envían a ningún sitio: no hay servidor al que enviarlos.',
  srOptimize: 'Pare — optimiza tus archivos',
  backToStart: 'Pare — volver al inicio',

  whatPareDoes: 'Qué hace Pare',
  features: [
    ['Imágenes', 'AVIF, WebP y un original optimizado en cada ancho que elijas, más la etiqueta <picture> para pegar.'],
    ['Fuentes', 'Divididas por alfabeto para que cada página cargue solo lo que necesita, o recortadas a los caracteres que usas. Con WOFF2 y @font-face.'],
    ['Código', 'CSS, JavaScript, HTML y SVG minificados. Se reescriben, nunca se borran: nada que funcionaba deja de funcionar.'],
    ['Sitios completos', 'Suelta una carpeta: cada archivo se reduce en su sitio y cada página se compara antes y después antes de que puedas descargarla.'],
  ],
  steps: [
    ['Suelta', 'Una carpeta, unos archivos o una captura pegada.'],
    ['Ajusta', 'Cada opción es un interruptor, y ves su efecto antes de empezar.'],
    ['Llévatelo', 'Un zip, una carpeta y el código para pegar.'],
  ],

  dropHere: 'Suelta aquí una carpeta o archivos',
  dropMore: 'Suelta, pega o elige más archivos para empezar de nuevo',
  reading: 'Leyendo archivos…',
  dropOverlay: 'Suelta para añadir estos archivos',
  dropOverlaySub: 'Se quedan en esta pestaña.',
  dropHint: 'O un .zip, o pega una imagen. No se sube nada: todo ocurre en esta pestaña del navegador.',
  chooseFolder: 'Elegir una carpeta',
  chooseFiles: 'Elegir archivos',
  trySample: '¿No tienes un archivo a mano? Prueba con una foto de ejemplo',
  sampleFailed: 'No se pudo cargar el ejemplo. Vuelve a intentarlo cuando tengas conexión.',
  nothingReadable: 'No había nada legible en eso.',

  optimizeFiles: (n) => `Optimizar ${n} ${n === 1 ? 'archivo' : 'archivos'}`,
  optimizeSite: 'Optimizar el sitio',
  working: 'Trabajando…',
  startOver: 'Empezar de nuevo',
  dropped: (n, workers) => `${n} añadidos · ${workers} procesos`,
  kindCount: (n, kind) =>
    `${n} ${kind === 'image' ? (n === 1 ? 'imagen' : 'imágenes') : kind === 'font' ? (n === 1 ? 'fuente' : 'fuentes') : kind === 'code' ? 'código' : 'otros'}`,
  checkingPages: 'Comprobando páginas',
  optimizing: 'Optimizando',
  doneOf: (done, total) => `${done} de ${total} listos`,
  filesFinished: 'Archivos terminados',
  modeSite: (parts) => `Optimizar el sitio completo (${parts})`,
  siteParts: (pages, templates) =>
    [
      pages > 0 ? `${pages} ${pages === 1 ? 'página' : 'páginas'}` : '',
      templates > 0 ? `${templates} ${templates === 1 ? 'plantilla' : 'plantillas'}` : '',
    ]
      .filter(Boolean)
      .join(', '),
  modeSiteHint: 'Cada archivo se reduce en su sitio, las direcciones siguen siendo correctas y cada página se comprueba antes de descargar.',
  modeSiteHintTemplates:
    'Cada archivo se reduce con su propio nombre. Las plantillas nunca se tocan, así que un sitio WordPress o PHP sigue funcionando.',
  modeFiles: 'Solo quiero archivos optimizados y código',
  modeFilesHint: 'AVIF, WebP, fuentes y código minificado, con el HTML para pegar donde quieras.',
  whatToDo: 'Qué hacer',

  downloadZip: 'Descargar zip',
  saveToFolder: 'Guardar en una carpeta…',
  copySnippet: 'Copiar código',
  copyAllSnippets: (n) => `Copiar los ${n} fragmentos`,
  savingsReport: 'Informe de ahorro',
  zipNote: 'Incluye snippets.html con cada etiqueta generada. Tus archivos originales no se tocan.',
  englishNote: "Algunas notas técnicas siguen en inglés por ahora.",

  noUpload: 'Sin subidas, sin cuenta, sin servidor.',
  offlineNote: ' Todo lo que hayas usado una vez en este navegador sigue funcionando sin conexión.',
  tools: 'Herramientas',
  everything: 'Todo lo que hace Pare',
  bugReport: 'Copiar datos para informar de un error',

  colFile: 'Archivo',
  colBefore: 'Antes',
  colAfter: 'Después',
  colChange: 'Cambio',
  smaller: (n) => `${n}% menos`,
  noChange: 'sin cambios',
  waiting: 'en espera',
  save: 'Guardar',
  share: 'Compartir',
  saveFile: (name) => `Guardar ${name}`,
  shareFile: (name) => `Compartir ${name}`,
  locationRemoved: 'Ubicación eliminada',
  locationTitle: 'Esta foto guardaba dónde se tomó. Los archivos que hace Pare no.',

  savingsLabel: 'Ahorro',
  visitorDownloads: 'Lo que descarga un visitante',
  savingsExplain: (zip) =>
    `Para imágenes, el formato más pequeño a tamaño completo que lee su navegador; para fuentes divididas, solo el primer archivo; para código, el archivo minificado tal cual. El zip ocupa ${zip} con todas las variantes: nadie lo descarga todo.`,
  compressedNote: (size) =>
    `Si tu servidor también comprime el código (gzip o brotli), enviaría unos ${size}. Es una estimación: los archivos que guardas no tienen ese tamaño, y las copias .gz y .br solo ayudan cuando tu servidor está configurado para enviarlas.`,
  locationsRemoved: (n) =>
    n === 1
      ? 'Una foto guardaba el lugar donde se tomó. Esa ubicación no está en el archivo que descargas.'
      : `${n} fotos guardaban el lugar donde se tomaron. Esas ubicaciones no están en los archivos que descargas.`,
  skippedNote: (n) => `${n} ${n === 1 ? 'archivo quedó' : 'archivos quedaron'} sin cambios. El motivo está en su fila.`,

  outputResponsive: 'Varios tamaños',
  outputSingle: 'Un tamaño',
  outputTarget: 'Bajo un peso',
  outputIcons: 'Iconos de app',
  hintResponsive: 'Varios anchos, y el HTML que permite que cada pantalla descargue el que necesita.',
  hintSingle: 'Un archivo por formato al tamaño que elijas. Para una miniatura, un avatar o una imagen que colocas tú.',
  hintTarget: 'Un archivo por formato, cada uno con ese peso o menos: para un formulario, un correo o un chat.',
  hintIcons:
    'favicon.ico, el icono táctil de Apple, los iconos de un sitio instalado, uno adaptable para Android, y el manifiesto y las etiquetas que los listan, a partir de una imagen casi cuadrada de 512 px o más.',
  everyFileUnder: 'Cada archivo con este peso o menos',
  sizeLimits: 'Límites habituales',
  anySize: 'O cualquier peso, en KB',
  targetExplain:
    'Pare baja primero la calidad y reduce la imagen solo si hace falta, y después te dice qué cambió. Una foto sin transparencia sale en JPEG, que es lo que piden casi todos los formularios.',
  formPresets: "Para un formulario",
  formPhoto: "Foto para formulario",
  signature: "Firma",
  passport: "Foto de pasaporte",
  avatar: "Foto de perfil",
  presetsHint: "Cada formulario es distinto: revisa el tamaño que pide el tuyo.",
  exactSize: "Tamaño exacto, en píxeles (opcional)",
  width: "Ancho",
  height: "Alto",
  exactSizeHint: "Con ambos, se recorta el centro de la imagen a esa forma. Después Pare solo baja la calidad —el tamaño se mantiene exacto— y avisa si no llega al límite.",
  notes: {
    savedAsJpeg: () => 'Guardada como JPEG: un PNG no puede cambiar calidad por peso, y esta imagen no tiene transparencia, así que no se pierde nada visible.',
    couldNotFit: (format, limit, smallest) => `No se pudo dejar el ${format} por debajo de ${limit}. Lo más pequeño que pudo hacer Pare es ${smallest}.`,
    madeSmaller: (limit, format, w, h, fw, fh) => `Para quedar por debajo de ${limit}, el ${format} quedó en ${w}×${h} (desde ${fw}×${fh}).`,
    savedAtQuality: (format, q, max, limit) => `El ${format} se guardó con calidad ${q} (de ${max}) para quedar por debajo de ${limit}.`,
    cropped: (w, h, fw, fh) => `Recortada a ${w}×${h} desde el centro de la imagen de ${fw}×${fh}.`,
    tooSmallForBox: (w, h, ow, oh) => `Esta imagen es más pequeña que ${w}×${h}, así que quedó en ${ow}×${oh}: Pare nunca amplía una imagen.`,
    tiffPages: (n) => `Este TIFF tiene ${n} páginas; solo se convirtió la primera.`,
    alreadySmall: () => 'Ya es todo lo pequeña que puede ser: se conservó el original.',
    biggerKept: (meta) => (meta ? 'Volver a codificarla a tamaño completo la hacía más grande, así que se conservó el original, sin los datos de la cámara.' : 'Volver a codificarla a tamaño completo la hacía más grande, así que se conservó el original.'),
    unreadable: () => 'No se pudo leer este archivo: puede estar dañado, ser demasiado grande para esta pestaña o tener un formato que este navegador no lee. Se copió sin cambios.',
    tooLargeToRead: (w) => `Esta imagen era demasiado grande para trabajarla a tamaño completo, así que se leyó a ${w} px de ancho. El archivo más grande tiene ese ancho.`,
    iconsSquare: (s1, s2, w, h) => `Los iconos son cuadrados, así que se usó el centro de ${s1}×${s2} de esta imagen de ${w}×${h}.`,
    iconsSmall: (side) => `Esta imagen mide ${side} px, así que los iconos grandes (hasta 512 px) se amplían y pueden verse borrosos. Un original de 512 px o más da iconos nítidos.`,
    iconsPlace: () => 'Pon estos archivos en la raíz de tu sitio y cambia el nombre en manifest.webmanifest por el de tu sitio.',
    maskableWhite: () => 'El icono adaptable va sobre blanco, porque esta imagen no tiene un color de fondo sólido propio.',
    animation: (frames, gif) => `Se mantuvo como animación (${frames} fotogramas) a su tamaño: un WebP animado${gif ? ', con el GIF original para los navegadores que no puedan mostrarlo' : ''}.`,
    animationBigger: () => 'El WebP animado no salió más pequeño que este GIF, así que el GIF se conservó sin cambios.',
    animationTarget: () => 'Este GIF es animado, y una animación no puede quedar bajo un peso sin perder fotogramas. Se copió sin cambios.',
    minified: (rest) => 'minificado' + rest,
    copiedUnchanged: () => 'copiado sin cambios',
    fontFiles: (n, c) => `${n} archivos · ${c} caracteres`,
    fontOf: (a, b) => `${a} de ${b} caracteres`,
  },
};

export default es;
