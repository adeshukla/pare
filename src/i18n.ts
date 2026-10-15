import { LANGS, type Lang } from './tasks';

/**
 * The words on the everyday path - the landing page, the drop zone, the run
 * button, results, savings, Save and Share, the size and icon options - in the
 * languages of the people who most need "make my photo smaller" (ADR-041).
 *
 * A page's language is its address: /hi/, /es/tools/compress-image/ and so on,
 * set as <html lang> by scripts/make-task-pages.mjs. No guessing from the
 * browser, so a link always opens in the language it was shared in.
 *
 * Notes about a single file, and the advanced settings, are English for now;
 * the page says so. English is the source: every other language must supply
 * every key, or this file does not compile.
 */

const en = {
  langName: 'English',
  language: 'Language',
  privacyChip: 'Nothing leaves this tab',
  worksOffline: 'Works offline',

  heroChip: 'Images · fonts · code · whole sites',
  taskChip: 'Free · private · works offline',
  heroHeading: ['Pare it', 'down.'] as [string, string],
  heroLede:
    'Shrink your images, fonts and code, and get the markup to use them. Files are read in this tab and never sent anywhere — there is no server to send them to.',
  srOptimize: 'Pare — optimize your files',
  backToStart: 'Pare — back to the start',

  whatPareDoes: 'What Pare does',
  features: [
    ['Images', 'AVIF, WebP and an optimized original at every width you choose — plus the <picture> tag to paste.'],
    ['Fonts', 'Split by script so pages load only what they need, or cut to the characters you use. WOFF2 and @font-face included.'],
    ['Code', 'CSS, JavaScript, HTML and SVG minified. Rewritten, never removed — nothing that worked can stop working.'],
    ['Whole sites', 'Drop a folder: every file shrinks in place, and every page is rendered before and after before you can download it.'],
  ] as Array<[string, string]>,
  steps: [
    ['Drop', 'A folder, some files, or a pasted screenshot.'],
    ['Tune', 'Every option is a switch, with its cost shown before you run.'],
    ['Take it', 'A zip, a folder, and the markup to paste.'],
  ] as Array<[string, string]>,

  dropHere: 'Drop a folder or files here',
  dropMore: 'Drop, paste or choose more files to start again',
  reading: 'Reading files…',
  dropOverlay: 'Drop to add these files',
  dropOverlaySub: 'They stay in this tab.',
  dropHint: 'Or a .zip, or paste an image. Nothing is uploaded — everything runs in this browser tab.',
  chooseFolder: 'Choose a folder',
  chooseFiles: 'Choose files',
  trySample: 'No file to hand? Try it with a sample photo',
  sampleFailed: 'The sample could not be loaded. Try again once you are online.',
  nothingReadable: 'Nothing readable in that drop.',

  optimizeFiles: (n: number) => `Optimize ${n} ${n === 1 ? 'file' : 'files'}`,
  optimizeSite: 'Optimize the site',
  working: 'Working…',
  startOver: 'Start over',
  dropped: (n: number, workers: number) => `${n} dropped · ${workers} worker${workers === 1 ? '' : 's'}`,
  kindCount: (n: number, kind: 'image' | 'font' | 'code' | 'other') =>
    `${n} ${kind === 'image' ? (n === 1 ? 'image' : 'images') : kind === 'font' ? (n === 1 ? 'font' : 'fonts') : kind}`,
  checkingPages: 'Checking pages',
  optimizing: 'Optimizing',
  doneOf: (done: number, total: number) => `${done} of ${total} done`,
  filesFinished: 'Files finished',
  modeSite: (parts: string) => `Optimize the whole site (${parts})`,
  siteParts: (pages: number, templates: number) =>
    [
      pages > 0 ? `${pages} page${pages === 1 ? '' : 's'}` : '',
      templates > 0 ? `${templates} template${templates === 1 ? '' : 's'}` : '',
    ]
      .filter(Boolean)
      .join(', '),
  modeSiteHint: 'Every file shrinks in place, addresses stay correct, and each page is checked before you can download.',
  modeSiteHintTemplates:
    'Every file shrinks in place under its own name. Templates are never touched, so a WordPress or PHP site keeps working.',
  modeFiles: 'Just give me optimized files and snippets',
  modeFilesHint: 'AVIF, WebP, fonts and minified code, with markup to paste where you like.',
  whatToDo: 'What to do',

  downloadZip: 'Download zip',
  saveToFolder: 'Save to a folder…',
  copySnippet: 'Copy snippet',
  copyAllSnippets: (n: number) => `Copy all ${n} snippets`,
  savingsReport: 'Savings report',
  zipNote: 'Includes snippets.html with every generated tag. Your original files are untouched.',
  englishNote: '',

  noUpload: 'No upload, no account, no server.',
  offlineNote: ' Anything you have used once in this browser keeps working without a connection.',
  tools: 'Tools',
  everything: 'Everything Pare does',
  bugReport: 'Copy details for a bug report',

  colFile: 'File',
  colBefore: 'Before',
  colAfter: 'After',
  colChange: 'Change',
  smaller: (n: number) => `${n}% smaller`,
  noChange: 'no change',
  waiting: 'waiting',
  save: 'Save',
  share: 'Share',
  saveFile: (name: string) => `Save ${name}`,
  shareFile: (name: string) => `Share ${name}`,
  locationRemoved: 'Location removed',
  locationTitle: 'This photo recorded where it was taken. The files Pare made do not.',

  savingsLabel: 'Savings',
  visitorDownloads: 'What a visitor downloads',
  savingsExplain: (zip: string) =>
    `For images the smallest full-size format their browser reads, for split fonts the first file only, for code the smallest compressed copy. The zip holds ${zip} across every variant — nobody downloads all of it.`,
  locationsRemoved: (n: number) =>
    n === 1
      ? 'One photo held the place it was taken. That location is not in the file you download.'
      : `${n} photos held the place they were taken. Those locations are not in the files you download.`,
  skippedNote: (n: number) => `${n} file${n === 1 ? ' was' : 's were'} left unchanged. The reason is on the row.`,

  outputResponsive: 'Responsive set',
  outputSingle: 'One size',
  outputTarget: 'Under a size',
  outputIcons: 'App icons',
  hintResponsive: 'Several widths, and markup that lets each screen download the one it needs.',
  hintSingle: 'One file per format at the size you set. For a thumbnail, an avatar, or an image you place yourself.',
  hintTarget: 'One file per format, each at or under a file size - for an upload form, an email or a chat.',
  hintIcons:
    'favicon.ico, the Apple touch icon, the icons an installed site uses, a maskable one for Android, and the manifest and tags that list them - from one square-ish picture, 512px or larger.',
  everyFileUnder: 'Every file at or under',
  sizeLimits: 'Common size limits',
  anySize: 'Or any size, in KB',
  targetExplain:
    'Pare lowers quality first and makes the picture smaller only if it has to, then tells you what it changed. A photo without transparency comes out as JPEG, which is what most upload forms ask for.',
};

export type Strings = typeof en;

const hi: Strings = {
  langName: 'हिन्दी',
  language: 'भाषा',
  privacyChip: 'कुछ भी इस टैब से बाहर नहीं जाता',
  worksOffline: 'ऑफ़लाइन भी चलता है',

  heroChip: 'तस्वीरें · फ़ॉन्ट · कोड · पूरी वेबसाइट',
  taskChip: 'मुफ़्त · निजी · ऑफ़लाइन भी',
  heroHeading: ['फ़ाइलें करें', 'छोटी।'],
  heroLede:
    'अपनी तस्वीरें, फ़ॉन्ट और कोड छोटे करें। फ़ाइलें इसी टैब में पढ़ी जाती हैं और कहीं नहीं भेजी जातीं — भेजने के लिए कोई सर्वर है ही नहीं।',
  srOptimize: 'Pare — अपनी फ़ाइलें छोटी करें',
  backToStart: 'Pare — शुरुआत पर लौटें',

  whatPareDoes: 'Pare क्या करता है',
  features: [
    ['तस्वीरें', 'AVIF, WebP और बेहतर बनाई गई मूल तस्वीर, हर चौड़ाई पर — साथ में चिपकाने के लिए <picture> टैग।'],
    ['फ़ॉन्ट', 'लिपि के हिसाब से बँटे, ताकि पेज सिर्फ़ ज़रूरी हिस्सा लोड करें, या सिर्फ़ इस्तेमाल हुए अक्षरों तक छोटे। WOFF2 और @font-face साथ में।'],
    ['कोड', 'CSS, JavaScript, HTML और SVG छोटे किए जाते हैं — बदले जाते हैं, हटाए नहीं, इसलिए जो चलता था वह चलता रहेगा।'],
    ['पूरी वेबसाइट', 'एक फ़ोल्डर डालें: हर फ़ाइल अपनी जगह छोटी होती है, और डाउनलोड से पहले हर पेज पहले और बाद में जाँचा जाता है।'],
  ],
  steps: [
    ['डालें', 'एक फ़ोल्डर, कुछ फ़ाइलें या चिपकाया गया स्क्रीनशॉट।'],
    ['चुनें', 'हर विकल्प एक स्विच है, और चलाने से पहले उसका असर दिखता है।'],
    ['ले जाएँ', 'एक zip, एक फ़ोल्डर, और चिपकाने के लिए कोड।'],
  ],

  dropHere: 'फ़ोल्डर या फ़ाइलें यहाँ डालें',
  dropMore: 'नई शुरुआत के लिए और फ़ाइलें डालें, चिपकाएँ या चुनें',
  reading: 'फ़ाइलें पढ़ी जा रही हैं…',
  dropOverlay: 'इन फ़ाइलों को जोड़ने के लिए छोड़ें',
  dropOverlaySub: 'ये इसी टैब में रहती हैं।',
  dropHint: 'या एक .zip, या कोई तस्वीर चिपकाएँ। कुछ भी अपलोड नहीं होता — सब कुछ इसी टैब में चलता है।',
  chooseFolder: 'फ़ोल्डर चुनें',
  chooseFiles: 'फ़ाइलें चुनें',
  trySample: 'अभी कोई फ़ाइल नहीं है? एक नमूना तस्वीर पर आज़माएँ',
  sampleFailed: 'नमूना लोड नहीं हो सका। इंटरनेट से जुड़ने पर फिर कोशिश करें।',
  nothingReadable: 'इसमें पढ़ने लायक कुछ नहीं मिला।',

  optimizeFiles: (n) => `${n} ${n === 1 ? 'फ़ाइल' : 'फ़ाइलें'} छोटी करें`,
  optimizeSite: 'वेबसाइट छोटी करें',
  working: 'काम चल रहा है…',
  startOver: 'फिर से शुरू करें',
  dropped: (n, workers) => `${n} डाली गईं · ${workers} वर्कर`,
  kindCount: (n, kind) => `${n} ${kind === 'image' ? 'तस्वीर' : kind === 'font' ? 'फ़ॉन्ट' : kind === 'code' ? 'कोड' : 'अन्य'}`,
  checkingPages: 'पेज जाँचे जा रहे हैं',
  optimizing: 'छोटा किया जा रहा है',
  doneOf: (done, total) => `${total} में से ${done} पूरी`,
  filesFinished: 'पूरी हुई फ़ाइलें',
  modeSite: (parts) => `पूरी वेबसाइट छोटी करें (${parts})`,
  siteParts: (pages, templates) =>
    [pages > 0 ? `${pages} पेज` : '', templates > 0 ? `${templates} टेम्पलेट` : ''].filter(Boolean).join(', '),
  modeSiteHint: 'हर फ़ाइल अपनी जगह छोटी होती है, पते सही रहते हैं, और डाउनलोड से पहले हर पेज जाँचा जाता है।',
  modeSiteHintTemplates:
    'हर फ़ाइल अपने ही नाम से छोटी होती है। टेम्पलेट कभी नहीं छुए जाते, इसलिए WordPress या PHP साइट चलती रहती है।',
  modeFiles: 'बस छोटी फ़ाइलें और कोड दें',
  modeFilesHint: 'AVIF, WebP, फ़ॉन्ट और छोटा कोड, साथ में चिपकाने के लिए HTML।',
  whatToDo: 'क्या करना है',

  downloadZip: 'zip डाउनलोड करें',
  saveToFolder: 'फ़ोल्डर में सहेजें…',
  copySnippet: 'कोड कॉपी करें',
  copyAllSnippets: (n) => `सभी ${n} कोड कॉपी करें`,
  savingsReport: 'बचत रिपोर्ट',
  zipNote: 'इसमें snippets.html भी है, जिसमें हर बना टैग है। आपकी मूल फ़ाइलें नहीं बदलतीं।',
  englishNote: 'हर फ़ाइल से जुड़ी टिप्पणियाँ अभी अंग्रेज़ी में हैं।',

  noUpload: 'कोई अपलोड नहीं, कोई खाता नहीं, कोई सर्वर नहीं।',
  offlineNote: ' इस ब्राउज़र में एक बार इस्तेमाल की गई हर चीज़ बिना इंटरनेट के भी चलती है।',
  tools: 'टूल',
  everything: 'Pare की सारी सुविधाएँ',
  bugReport: 'गड़बड़ी की रिपोर्ट के लिए जानकारी कॉपी करें',

  colFile: 'फ़ाइल',
  colBefore: 'पहले',
  colAfter: 'बाद में',
  colChange: 'बदलाव',
  smaller: (n) => `${n}% छोटी`,
  noChange: 'कोई बदलाव नहीं',
  waiting: 'प्रतीक्षा में',
  save: 'सहेजें',
  share: 'शेयर करें',
  saveFile: (name) => `${name} सहेजें`,
  shareFile: (name) => `${name} शेयर करें`,
  locationRemoved: 'जगह हटाई गई',
  locationTitle: 'इस तस्वीर में लिखा था कि वह कहाँ ली गई। Pare की बनाई फ़ाइलों में यह नहीं है।',

  savingsLabel: 'बचत',
  visitorDownloads: 'देखने वाला कितना डाउनलोड करता है',
  savingsExplain: (zip) =>
    `तस्वीरों के लिए वह सबसे छोटा पूरा आकार जिसे उनका ब्राउज़र पढ़ता है, बँटे फ़ॉन्ट के लिए सिर्फ़ पहली फ़ाइल, कोड के लिए सबसे छोटी संपीड़ित प्रति। zip में हर रूप मिलाकर ${zip} है — कोई भी सब कुछ डाउनलोड नहीं करता।`,
  locationsRemoved: (n) =>
    n === 1
      ? 'एक तस्वीर में लिखा था कि वह कहाँ ली गई। वह जगह डाउनलोड होने वाली फ़ाइल में नहीं है।'
      : `${n} तस्वीरों में लिखा था कि वे कहाँ ली गईं। वे जगहें डाउनलोड होने वाली फ़ाइलों में नहीं हैं।`,
  skippedNote: (n) => `${n} ${n === 1 ? 'फ़ाइल' : 'फ़ाइलें'} बिना बदले छोड़ी गईं। कारण उसकी पंक्ति में लिखा है।`,

  outputResponsive: 'कई आकार',
  outputSingle: 'एक आकार',
  outputTarget: 'तय साइज़ से कम',
  outputIcons: 'ऐप आइकन',
  hintResponsive: 'कई चौड़ाइयाँ, और ऐसा HTML जिससे हर स्क्रीन सिर्फ़ ज़रूरी फ़ाइल डाउनलोड करे।',
  hintSingle: 'हर फ़ॉर्मैट में आपके चुने आकार की एक फ़ाइल। थंबनेल, प्रोफ़ाइल फ़ोटो या अपनी जगह पर लगाई जाने वाली तस्वीर के लिए।',
  hintTarget: 'हर फ़ॉर्मैट में एक फ़ाइल, तय साइज़ के बराबर या उससे कम — फ़ॉर्म अपलोड, ईमेल या चैट के लिए।',
  hintIcons:
    'favicon.ico, Apple टच आइकन, इंस्टॉल की गई साइट के आइकन, Android के लिए maskable आइकन, और उन्हें बताने वाला manifest और टैग — एक लगभग चौकोर, 512px या बड़ी तस्वीर से।',
  everyFileUnder: 'हर फ़ाइल इतनी या इससे कम',
  sizeLimits: 'आम साइज़ सीमाएँ',
  anySize: 'या कोई भी साइज़, KB में',
  targetExplain:
    'Pare पहले क्वालिटी घटाता है और ज़रूरत हो तभी तस्वीर छोटी करता है, फिर बताता है कि क्या बदला। बिना पारदर्शिता वाली फ़ोटो JPEG बनती है, जो ज़्यादातर अपलोड फ़ॉर्म माँगते हैं।',
};

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
  englishNote: 'Las notas sobre cada archivo están en inglés por ahora.',

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
    `Para imágenes, el formato más pequeño a tamaño completo que lee su navegador; para fuentes divididas, solo el primer archivo; para código, la copia comprimida más pequeña. El zip ocupa ${zip} con todas las variantes: nadie lo descarga todo.`,
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
};

const pt: Strings = {
  langName: 'Português',
  language: 'Idioma',
  privacyChip: 'Nada sai desta aba',
  worksOffline: 'Funciona offline',

  heroChip: 'Imagens · fontes · código · sites inteiros',
  taskChip: 'Grátis · privado · funciona offline',
  heroHeading: ['Deixe seus arquivos', 'leves.'],
  heroLede:
    'Reduza suas imagens, fontes e código, e receba o código para usá-los. Os arquivos são lidos nesta aba e nunca enviados a lugar nenhum — não há servidor para onde enviá-los.',
  srOptimize: 'Pare — otimize seus arquivos',
  backToStart: 'Pare — voltar ao início',

  whatPareDoes: 'O que o Pare faz',
  features: [
    ['Imagens', 'AVIF, WebP e um original otimizado em cada largura que você escolher — e a tag <picture> pronta para colar.'],
    ['Fontes', 'Divididas por alfabeto para cada página carregar só o que precisa, ou cortadas aos caracteres que você usa. Com WOFF2 e @font-face.'],
    ['Código', 'CSS, JavaScript, HTML e SVG minificados. Reescritos, nunca apagados — nada que funcionava para de funcionar.'],
    ['Sites inteiros', 'Solte uma pasta: cada arquivo encolhe no lugar, e cada página é comparada antes e depois antes de você poder baixar.'],
  ],
  steps: [
    ['Solte', 'Uma pasta, alguns arquivos ou uma captura de tela colada.'],
    ['Ajuste', 'Cada opção é um botão, e você vê o efeito antes de começar.'],
    ['Leve', 'Um zip, uma pasta e o código para colar.'],
  ],

  dropHere: 'Solte aqui uma pasta ou arquivos',
  dropMore: 'Solte, cole ou escolha mais arquivos para recomeçar',
  reading: 'Lendo arquivos…',
  dropOverlay: 'Solte para adicionar estes arquivos',
  dropOverlaySub: 'Eles ficam nesta aba.',
  dropHint: 'Ou um .zip, ou cole uma imagem. Nada é enviado — tudo acontece nesta aba do navegador.',
  chooseFolder: 'Escolher uma pasta',
  chooseFiles: 'Escolher arquivos',
  trySample: 'Sem um arquivo à mão? Teste com uma foto de exemplo',
  sampleFailed: 'Não foi possível carregar o exemplo. Tente de novo quando estiver online.',
  nothingReadable: 'Não havia nada legível aí.',

  optimizeFiles: (n) => `Otimizar ${n} ${n === 1 ? 'arquivo' : 'arquivos'}`,
  optimizeSite: 'Otimizar o site',
  working: 'Trabalhando…',
  startOver: 'Recomeçar',
  dropped: (n, workers) => `${n} adicionados · ${workers} processos`,
  kindCount: (n, kind) =>
    `${n} ${kind === 'image' ? (n === 1 ? 'imagem' : 'imagens') : kind === 'font' ? (n === 1 ? 'fonte' : 'fontes') : kind === 'code' ? 'código' : 'outros'}`,
  checkingPages: 'Verificando páginas',
  optimizing: 'Otimizando',
  doneOf: (done, total) => `${done} de ${total} prontos`,
  filesFinished: 'Arquivos concluídos',
  modeSite: (parts) => `Otimizar o site inteiro (${parts})`,
  siteParts: (pages, templates) =>
    [
      pages > 0 ? `${pages} ${pages === 1 ? 'página' : 'páginas'}` : '',
      templates > 0 ? `${templates} ${templates === 1 ? 'template' : 'templates'}` : '',
    ]
      .filter(Boolean)
      .join(', '),
  modeSiteHint: 'Cada arquivo encolhe no lugar, os endereços continuam certos e cada página é verificada antes de você baixar.',
  modeSiteHintTemplates:
    'Cada arquivo encolhe com o próprio nome. Os templates nunca são tocados, então um site WordPress ou PHP continua funcionando.',
  modeFiles: 'Só quero arquivos otimizados e código',
  modeFilesHint: 'AVIF, WebP, fontes e código minificado, com o HTML para colar onde quiser.',
  whatToDo: 'O que fazer',

  downloadZip: 'Baixar zip',
  saveToFolder: 'Salvar em uma pasta…',
  copySnippet: 'Copiar código',
  copyAllSnippets: (n) => `Copiar os ${n} trechos`,
  savingsReport: 'Relatório de economia',
  zipNote: 'Inclui snippets.html com cada tag gerada. Seus arquivos originais não são alterados.',
  englishNote: 'As notas sobre cada arquivo estão em inglês por enquanto.',

  noUpload: 'Sem upload, sem conta, sem servidor.',
  offlineNote: ' Tudo o que você já usou uma vez neste navegador continua funcionando sem internet.',
  tools: 'Ferramentas',
  everything: 'Tudo o que o Pare faz',
  bugReport: 'Copiar dados para relatar um erro',

  colFile: 'Arquivo',
  colBefore: 'Antes',
  colAfter: 'Depois',
  colChange: 'Mudança',
  smaller: (n) => `${n}% menor`,
  noChange: 'sem mudança',
  waiting: 'aguardando',
  save: 'Salvar',
  share: 'Compartilhar',
  saveFile: (name) => `Salvar ${name}`,
  shareFile: (name) => `Compartilhar ${name}`,
  locationRemoved: 'Localização removida',
  locationTitle: 'Esta foto guardava onde foi tirada. Os arquivos que o Pare faz, não.',

  savingsLabel: 'Economia',
  visitorDownloads: 'O que um visitante baixa',
  savingsExplain: (zip) =>
    `Para imagens, o menor formato em tamanho cheio que o navegador lê; para fontes divididas, só o primeiro arquivo; para código, a menor cópia comprimida. O zip tem ${zip} com todas as variantes — ninguém baixa tudo.`,
  locationsRemoved: (n) =>
    n === 1
      ? 'Uma foto guardava o lugar onde foi tirada. Essa localização não está no arquivo que você baixa.'
      : `${n} fotos guardavam o lugar onde foram tiradas. Essas localizações não estão nos arquivos que você baixa.`,
  skippedNote: (n) => `${n} ${n === 1 ? 'arquivo ficou' : 'arquivos ficaram'} sem mudança. O motivo está na linha.`,

  outputResponsive: 'Vários tamanhos',
  outputSingle: 'Um tamanho',
  outputTarget: 'Abaixo de um peso',
  outputIcons: 'Ícones de app',
  hintResponsive: 'Várias larguras, e o HTML que deixa cada tela baixar só a que precisa.',
  hintSingle: 'Um arquivo por formato no tamanho que você definir. Para uma miniatura, um avatar ou uma imagem que você posiciona.',
  hintTarget: 'Um arquivo por formato, cada um com esse peso ou menos — para um formulário, um e-mail ou um chat.',
  hintIcons:
    'favicon.ico, o ícone de toque da Apple, os ícones de um site instalado, um adaptável para Android, e o manifesto e as tags que os listam — a partir de uma imagem quase quadrada, de 512 px ou mais.',
  everyFileUnder: 'Cada arquivo com este peso ou menos',
  sizeLimits: 'Limites comuns',
  anySize: 'Ou qualquer peso, em KB',
  targetExplain:
    'O Pare reduz a qualidade primeiro e diminui a imagem só se precisar, e depois diz o que mudou. Uma foto sem transparência sai em JPEG, que é o que a maioria dos formulários pede.',
};

const id: Strings = {
  langName: 'Bahasa Indonesia',
  language: 'Bahasa',
  privacyChip: 'Tidak ada yang keluar dari tab ini',
  worksOffline: 'Bisa dipakai offline',

  heroChip: 'Gambar · font · kode · seluruh situs',
  taskChip: 'Gratis · pribadi · bisa offline',
  heroHeading: ['Buat file Anda', 'lebih ringan.'],
  heroLede:
    'Kecilkan gambar, font, dan kode Anda, lalu dapatkan kode untuk memakainya. File dibaca di tab ini dan tidak pernah dikirim ke mana pun — tidak ada server untuk menerimanya.',
  srOptimize: 'Pare — optimalkan file Anda',
  backToStart: 'Pare — kembali ke awal',

  whatPareDoes: 'Apa yang dilakukan Pare',
  features: [
    ['Gambar', 'AVIF, WebP, dan file asli yang dioptimalkan di setiap lebar yang Anda pilih — plus tag <picture> untuk ditempel.'],
    ['Font', 'Dipecah per aksara agar halaman hanya memuat yang diperlukan, atau dipangkas ke karakter yang Anda pakai. WOFF2 dan @font-face disertakan.'],
    ['Kode', 'CSS, JavaScript, HTML, dan SVG diminifikasi. Ditulis ulang, tidak pernah dihapus — yang tadinya jalan tetap jalan.'],
    ['Seluruh situs', 'Taruh sebuah folder: setiap file mengecil di tempatnya, dan setiap halaman dicek sebelum dan sesudah sebelum Anda bisa mengunduh.'],
  ],
  steps: [
    ['Taruh', 'Sebuah folder, beberapa file, atau tangkapan layar yang ditempel.'],
    ['Atur', 'Setiap pilihan berupa sakelar, dan efeknya terlihat sebelum dijalankan.'],
    ['Ambil', 'Sebuah zip, sebuah folder, dan kode untuk ditempel.'],
  ],

  dropHere: 'Taruh folder atau file di sini',
  dropMore: 'Taruh, tempel, atau pilih file lain untuk mulai lagi',
  reading: 'Membaca file…',
  dropOverlay: 'Lepaskan untuk menambahkan file ini',
  dropOverlaySub: 'File tetap di tab ini.',
  dropHint: 'Atau sebuah .zip, atau tempel gambar. Tidak ada yang diunggah — semuanya berjalan di tab browser ini.',
  chooseFolder: 'Pilih folder',
  chooseFiles: 'Pilih file',
  trySample: 'Tidak ada file? Coba dengan foto contoh',
  sampleFailed: 'Contoh tidak bisa dimuat. Coba lagi saat sudah online.',
  nothingReadable: 'Tidak ada yang bisa dibaca di situ.',

  optimizeFiles: (n) => `Optimalkan ${n} file`,
  optimizeSite: 'Optimalkan situs',
  working: 'Sedang bekerja…',
  startOver: 'Mulai lagi',
  dropped: (n, workers) => `${n} ditambahkan · ${workers} proses`,
  kindCount: (n, kind) => `${n} ${kind === 'image' ? 'gambar' : kind === 'font' ? 'font' : kind === 'code' ? 'kode' : 'lainnya'}`,
  checkingPages: 'Memeriksa halaman',
  optimizing: 'Mengoptimalkan',
  doneOf: (done, total) => `${done} dari ${total} selesai`,
  filesFinished: 'File selesai',
  modeSite: (parts) => `Optimalkan seluruh situs (${parts})`,
  siteParts: (pages, templates) =>
    [pages > 0 ? `${pages} halaman` : '', templates > 0 ? `${templates} template` : ''].filter(Boolean).join(', '),
  modeSiteHint: 'Setiap file mengecil di tempatnya, alamat tetap benar, dan setiap halaman dicek sebelum Anda bisa mengunduh.',
  modeSiteHintTemplates:
    'Setiap file mengecil dengan namanya sendiri. Template tidak pernah disentuh, jadi situs WordPress atau PHP tetap berjalan.',
  modeFiles: 'Cukup beri saya file yang dioptimalkan dan kodenya',
  modeFilesHint: 'AVIF, WebP, font, dan kode yang diminifikasi, dengan HTML untuk ditempel di mana saja.',
  whatToDo: 'Apa yang dilakukan',

  downloadZip: 'Unduh zip',
  saveToFolder: 'Simpan ke folder…',
  copySnippet: 'Salin kode',
  copyAllSnippets: (n) => `Salin semua ${n} cuplikan`,
  savingsReport: 'Laporan penghematan',
  zipNote: 'Termasuk snippets.html berisi setiap tag yang dibuat. File asli Anda tidak diubah.',
  englishNote: 'Catatan untuk tiap file masih dalam bahasa Inggris untuk saat ini.',

  noUpload: 'Tanpa unggahan, tanpa akun, tanpa server.',
  offlineNote: ' Apa pun yang pernah Anda pakai di browser ini tetap berjalan tanpa internet.',
  tools: 'Alat',
  everything: 'Semua yang bisa dilakukan Pare',
  bugReport: 'Salin detail untuk laporan masalah',

  colFile: 'File',
  colBefore: 'Sebelum',
  colAfter: 'Sesudah',
  colChange: 'Perubahan',
  smaller: (n) => `${n}% lebih kecil`,
  noChange: 'tidak berubah',
  waiting: 'menunggu',
  save: 'Simpan',
  share: 'Bagikan',
  saveFile: (name) => `Simpan ${name}`,
  shareFile: (name) => `Bagikan ${name}`,
  locationRemoved: 'Lokasi dihapus',
  locationTitle: 'Foto ini mencatat tempat foto diambil. File buatan Pare tidak.',

  savingsLabel: 'Penghematan',
  visitorDownloads: 'Yang diunduh pengunjung',
  savingsExplain: (zip) =>
    `Untuk gambar, format ukuran penuh terkecil yang dibaca browsernya; untuk font yang dipecah, hanya file pertama; untuk kode, salinan terkompresi terkecil. Zip berisi ${zip} untuk semua varian — tidak ada yang mengunduh semuanya.`,
  locationsRemoved: (n) =>
    n === 1
      ? 'Satu foto mencatat tempat foto itu diambil. Lokasi itu tidak ada di file yang Anda unduh.'
      : `${n} foto mencatat tempat foto diambil. Lokasi itu tidak ada di file yang Anda unduh.`,
  skippedNote: (n) => `${n} file dibiarkan tanpa perubahan. Alasannya ada di barisnya.`,

  outputResponsive: 'Beberapa ukuran',
  outputSingle: 'Satu ukuran',
  outputTarget: 'Di bawah ukuran file',
  outputIcons: 'Ikon aplikasi',
  hintResponsive: 'Beberapa lebar, dan HTML yang membuat setiap layar mengunduh yang dibutuhkannya saja.',
  hintSingle: 'Satu file per format pada ukuran yang Anda tentukan. Untuk thumbnail, avatar, atau gambar yang Anda tempatkan sendiri.',
  hintTarget: 'Satu file per format, masing-masing seukuran itu atau lebih kecil — untuk formulir unggah, email, atau chat.',
  hintIcons:
    'favicon.ico, ikon sentuh Apple, ikon untuk situs yang dipasang, ikon maskable untuk Android, serta manifest dan tag yang mencantumkannya — dari satu gambar yang hampir persegi, 512px atau lebih.',
  everyFileUnder: 'Setiap file sebesar ini atau lebih kecil',
  sizeLimits: 'Batas ukuran umum',
  anySize: 'Atau ukuran berapa pun, dalam KB',
  targetExplain:
    'Pare menurunkan kualitas dulu dan baru mengecilkan gambar bila perlu, lalu memberi tahu apa yang diubah. Foto tanpa transparansi menjadi JPEG, format yang diminta kebanyakan formulir unggah.',
};

const ALL: Record<Lang, Strings> = { en, hi, es, pt, id };

/** This page's language, from its address (set as <html lang> when the page was generated). */
export const lang: Lang = (LANGS as readonly string[]).includes(document.documentElement.lang)
  ? (document.documentElement.lang as Lang)
  : 'en';

export const t: Strings = ALL[lang];

export const LANG_NAMES: Record<Lang, string> = Object.fromEntries(
  LANGS.map((l) => [l, ALL[l].langName]),
) as Record<Lang, string>;
