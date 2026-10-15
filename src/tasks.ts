import type { ImageSettings } from './lib/settings';

/**
 * Task pages (ADR-035): the same app at its own address, with the settings for
 * one job already chosen and words that say what it does. They exist because
 * most people arrive with a task - "HEIC to JPG", "under 100 KB" - not with a
 * wish for an asset optimizer.
 *
 * Read by the app (src/main.tsx) and by scripts/make-task-pages.mjs, which
 * writes each page's HTML and the sitemap. Plain data only: Node imports this
 * file directly.
 */

export type Task = {
  slug: string;
  /** Link text in the footer. */
  name: string;
  /** <title> and the share-card title. */
  title: string;
  /** Meta description and share-card text. */
  description: string;
  /** Headline, in two parts: plain, then the coloured word. */
  heading: [string, string];
  lede: string;
  /** Image settings this page starts from. Everything else is the default. */
  image: Partial<ImageSettings>;
};

export const TASKS: Task[] = [
  {
    slug: 'compress-image',
    name: 'Compress an image to a size',
    title: 'Compress an image to under 100 KB, 50 KB or any size — Pare',
    description:
      'Make a photo small enough for an upload form, an email or a chat: pick a size limit and Pare fits the image under it. In your browser, nothing uploaded.',
    heading: ['Make it fit', 'under 100 KB.'],
    lede: 'Pick a limit — 20 KB, 50 KB, 100 KB or your own — and Pare fits every image under it, lowering quality first and size only if it must. Nothing is uploaded.',
    image: { output: 'target', targetKb: 100, formats: { avif: false, webp: false, fallback: true } },
  },
  {
    slug: 'heic-to-jpg',
    name: 'HEIC to JPG',
    title: 'Convert HEIC to JPG in your browser — Pare',
    description:
      'Turn iPhone HEIC photos into JPGs that open everywhere. Many at once, full size, private: the photos never leave your browser.',
    heading: ['HEIC to', 'JPG.'],
    lede: 'Drop iPhone photos and get JPGs that open everywhere, at full size. Many at once, and nothing is uploaded — the conversion happens in this tab.',
    image: {
      output: 'single',
      single: { width: null, height: null, fit: 'contain' },
      formats: { avif: false, webp: false, fallback: true },
      quality: { avif: 50, webp: 75, fallback: 88 },
    },
  },
  {
    slug: 'resize-image',
    name: 'Resize an image',
    title: 'Resize images to any width or height — Pare',
    description:
      'Resize one image or hundreds to an exact width and height, fitted or cropped to fill, in your browser. Free, no upload.',
    heading: ['Resize to', 'any size.'],
    lede: 'Set a width, a height or both — fit inside, or crop to fill — and every image comes out that size. Never enlarged, never uploaded.',
    image: {
      output: 'single',
      single: { width: 1200, height: null, fit: 'contain' },
      formats: { avif: false, webp: false, fallback: true },
    },
  },
  {
    slug: 'convert-to-webp',
    name: 'Convert to WebP',
    title: 'Convert JPG and PNG to WebP — Pare',
    description:
      'Convert images to WebP, usually much smaller than JPG or PNG at the same look. Batch, in your browser, nothing uploaded.',
    heading: ['Convert to', 'WebP.'],
    lede: 'JPG, PNG, HEIC and more to WebP, at full size — usually far smaller for the same look. Batch, private, in this tab.',
    image: {
      output: 'single',
      single: { width: null, height: null, fit: 'contain' },
      formats: { avif: false, webp: true, fallback: false },
      quality: { avif: 50, webp: 80, fallback: 75 },
    },
  },
  {
    slug: 'convert-to-avif',
    name: 'Convert to AVIF',
    title: 'Convert images to AVIF — Pare',
    description:
      'Convert images to AVIF, the smallest widely supported image format. Batch, in your browser, nothing uploaded.',
    heading: ['Convert to', 'AVIF.'],
    lede: 'The smallest image format every current browser reads. Drop JPG, PNG, HEIC or WebP and get AVIF at full size, without uploading anything.',
    image: {
      output: 'single',
      single: { width: null, height: null, fit: 'contain' },
      formats: { avif: true, webp: false, fallback: false },
    },
  },
  {
    slug: 'make-favicon',
    name: 'Make a favicon',
    title: 'Make a favicon and app icons from one image — Pare',
    description:
      'favicon.ico, the Apple touch icon, Android and maskable icons, the web manifest and the tags to paste, from one picture. In your browser, nothing uploaded.',
    heading: ['Make a', 'favicon.'],
    lede: 'Drop a logo or a picture and get every icon a site needs — favicon.ico, Apple touch icon, Android and maskable icons — plus the manifest and the tags to paste. Nothing is uploaded.',
    image: { output: 'icons' },
  },
];

export const SITE = 'https://pare.devstash.me';

/**
 * Languages (ADR-041): English, and the languages of the most people who need
 * "make my photo smaller". Each has its own addresses - /hi/, /hi/tools/... -
 * so search engines send people to their own language.
 */
export const LANGS = ['en', 'hi', 'es', 'pt', 'id'] as const;
export type Lang = (typeof LANGS)[number];

const prefix = (lang: Lang) => (lang === 'en' ? '' : '/' + lang);
export const homePath = (lang: Lang = 'en') => `${prefix(lang)}/`;
export const taskPath = (task: Task, lang: Lang = 'en') => `${prefix(lang)}/tools/${task.slug}/`;

type Copy = Pick<Task, 'name' | 'title' | 'description' | 'heading' | 'lede'>;

/** The main page's title and description, per language. */
export const HOME: Record<Lang, { title: string; description: string }> = {
  en: {
    title: 'Pare — optimize your assets in the browser',
    description:
      'Compress and convert images, fonts and code without installing anything. Your files never leave your browser.',
  },
  hi: {
    title: 'Pare — तस्वीरें, फ़ॉन्ट और कोड ब्राउज़र में ही छोटे करें',
    description:
      'बिना कुछ इंस्टॉल किए तस्वीरें, फ़ॉन्ट और कोड छोटे करें और बदलें। आपकी फ़ाइलें आपके ब्राउज़र से बाहर नहीं जातीं।',
  },
  es: {
    title: 'Pare — optimiza imágenes, fuentes y código en tu navegador',
    description:
      'Comprime y convierte imágenes, fuentes y código sin instalar nada. Tus archivos nunca salen de tu navegador.',
  },
  pt: {
    title: 'Pare — otimize imagens, fontes e código no navegador',
    description:
      'Comprima e converta imagens, fontes e código sem instalar nada. Seus arquivos nunca saem do seu navegador.',
  },
  id: {
    title: 'Pare — optimalkan gambar, font, dan kode di browser',
    description:
      'Kompres dan ubah gambar, font, dan kode tanpa memasang apa pun. File Anda tidak pernah keluar dari browser.',
  },
};

const TRANSLATED: Record<Exclude<Lang, 'en'>, Record<string, Copy>> = {
  hi: {
    'compress-image': {
      name: 'तस्वीर को तय साइज़ तक छोटा करें',
      title: 'तस्वीर को 100 KB, 50 KB या किसी भी साइज़ से कम करें — Pare',
      description:
        'फ़ोटो को अपलोड फ़ॉर्म, ईमेल या चैट के लायक छोटा करें: एक सीमा चुनें और Pare तस्वीर को उससे कम कर देगा। ब्राउज़र में ही, कुछ अपलोड नहीं होता।',
      heading: ['साइज़ में लाएँ,', '100 KB से कम।'],
      lede: 'एक सीमा चुनें — 20 KB, 50 KB, 100 KB या अपनी — और Pare हर तस्वीर को उससे कम कर देगा: पहले क्वालिटी घटाकर, ज़रूरत हो तभी आकार। कुछ भी अपलोड नहीं होता।',
    },
    'heic-to-jpg': {
      name: 'HEIC से JPG',
      title: 'HEIC को JPG में बदलें, अपने ब्राउज़र में — Pare',
      description:
        'iPhone की HEIC तस्वीरों को ऐसे JPG में बदलें जो हर जगह खुलें। एक साथ कई, पूरे आकार में, निजी: तस्वीरें आपके ब्राउज़र से बाहर नहीं जातीं।',
      heading: ['HEIC से', 'JPG।'],
      lede: 'iPhone की तस्वीरें डालें और पूरे आकार के ऐसे JPG पाएँ जो हर जगह खुलें। एक साथ कई, और कुछ भी अपलोड नहीं होता — बदलाव इसी टैब में होता है।',
    },
    'resize-image': {
      name: 'तस्वीर का आकार बदलें',
      title: 'तस्वीरों को किसी भी चौड़ाई या ऊँचाई पर लाएँ — Pare',
      description:
        'एक या सैकड़ों तस्वीरों को तय चौड़ाई और ऊँचाई पर लाएँ, फ़िट करके या काटकर, ब्राउज़र में ही। मुफ़्त, बिना अपलोड।',
      heading: ['आकार बदलें,', 'जैसा चाहें।'],
      lede: 'चौड़ाई, ऊँचाई या दोनों तय करें — अंदर फ़िट करें या भरने तक काटें — और हर तस्वीर उसी आकार में मिलेगी। कभी बड़ी नहीं की जाती, कभी अपलोड नहीं होती।',
    },
    'convert-to-webp': {
      name: 'WebP में बदलें',
      title: 'JPG और PNG को WebP में बदलें — Pare',
      description:
        'तस्वीरों को WebP में बदलें, जो उसी दिखावट में JPG या PNG से अक्सर काफ़ी छोटा होता है। एक साथ कई, ब्राउज़र में, बिना अपलोड।',
      heading: ['बदलें', 'WebP में।'],
      lede: 'JPG, PNG, HEIC और दूसरे फ़ॉर्मैट से WebP, पूरे आकार में — उसी दिखावट में आम तौर पर काफ़ी छोटा। एक साथ कई, निजी, इसी टैब में।',
    },
    'convert-to-avif': {
      name: 'AVIF में बदलें',
      title: 'तस्वीरों को AVIF में बदलें — Pare',
      description:
        'तस्वीरों को AVIF में बदलें, सबसे छोटा फ़ॉर्मैट जिसे हर नया ब्राउज़र पढ़ता है। एक साथ कई, ब्राउज़र में, बिना अपलोड।',
      heading: ['बदलें', 'AVIF में।'],
      lede: 'सबसे छोटा फ़ॉर्मैट जिसे आज का हर ब्राउज़र पढ़ता है। JPG, PNG, HEIC या WebP डालें और पूरे आकार का AVIF पाएँ, बिना कुछ अपलोड किए।',
    },
    'make-favicon': {
      name: 'फ़ेविकॉन बनाएँ',
      title: 'एक तस्वीर से फ़ेविकॉन और ऐप आइकन बनाएँ — Pare',
      description:
        'एक तस्वीर से favicon.ico, Apple टच आइकन, Android और maskable आइकन, वेब manifest और चिपकाने के लिए टैग। ब्राउज़र में ही, कुछ अपलोड नहीं होता।',
      heading: ['बनाएँ', 'फ़ेविकॉन।'],
      lede: 'एक लोगो या तस्वीर डालें और साइट के लिए ज़रूरी हर आइकन पाएँ — favicon.ico, Apple टच आइकन, Android और maskable आइकन — साथ में manifest और चिपकाने के लिए टैग। कुछ भी अपलोड नहीं होता।',
    },
  },
  es: {
    'compress-image': {
      name: 'Comprimir una imagen a un peso',
      title: 'Comprime una imagen a menos de 100 KB, 50 KB o cualquier peso — Pare',
      description:
        'Haz que una foto quepa en un formulario, un correo o un chat: elige un límite y Pare deja la imagen por debajo. En tu navegador, sin subir nada.',
      heading: ['Que quepa,', 'menos de 100 KB.'],
      lede: 'Elige un límite — 20 KB, 50 KB, 100 KB o el tuyo — y Pare deja cada imagen por debajo, bajando primero la calidad y el tamaño solo si hace falta. No se sube nada.',
    },
    'heic-to-jpg': {
      name: 'HEIC a JPG',
      title: 'Convierte HEIC a JPG en tu navegador — Pare',
      description:
        'Convierte las fotos HEIC del iPhone en JPG que se abren en cualquier parte. Muchas a la vez, a tamaño completo y en privado: las fotos nunca salen de tu navegador.',
      heading: ['HEIC a', 'JPG.'],
      lede: 'Suelta fotos del iPhone y obtén JPG que se abren en cualquier parte, a tamaño completo. Muchas a la vez, y sin subir nada: la conversión ocurre en esta pestaña.',
    },
    'resize-image': {
      name: 'Cambiar el tamaño de una imagen',
      title: 'Cambia el tamaño de imágenes a cualquier ancho o alto — Pare',
      description:
        'Cambia el tamaño de una imagen o de cientos a un ancho y alto exactos, ajustadas o recortadas, en tu navegador. Gratis y sin subir nada.',
      heading: ['Al tamaño', 'que quieras.'],
      lede: 'Elige un ancho, un alto o ambos — ajustar dentro o recortar para llenar — y cada imagen sale de ese tamaño. Nunca se amplía, nunca se sube.',
    },
    'convert-to-webp': {
      name: 'Convertir a WebP',
      title: 'Convierte JPG y PNG a WebP — Pare',
      description:
        'Convierte imágenes a WebP, normalmente mucho más ligero que JPG o PNG con el mismo aspecto. Por lotes, en tu navegador, sin subir nada.',
      heading: ['Convierte a', 'WebP.'],
      lede: 'De JPG, PNG, HEIC y más a WebP, a tamaño completo: suele pesar mucho menos con el mismo aspecto. Por lotes, en privado, en esta pestaña.',
    },
    'convert-to-avif': {
      name: 'Convertir a AVIF',
      title: 'Convierte imágenes a AVIF — Pare',
      description:
        'Convierte imágenes a AVIF, el formato más ligero que leen todos los navegadores actuales. Por lotes, en tu navegador, sin subir nada.',
      heading: ['Convierte a', 'AVIF.'],
      lede: 'El formato de imagen más ligero que lee cualquier navegador actual. Suelta JPG, PNG, HEIC o WebP y obtén AVIF a tamaño completo, sin subir nada.',
    },
    'make-favicon': {
      name: 'Crear un favicon',
      title: 'Crea un favicon e iconos de app a partir de una imagen — Pare',
      description:
        'favicon.ico, el icono táctil de Apple, iconos para Android y adaptables, el manifiesto web y las etiquetas para pegar, a partir de una imagen. En tu navegador, sin subir nada.',
      heading: ['Crea un', 'favicon.'],
      lede: 'Suelta un logo o una imagen y obtén todos los iconos que necesita un sitio — favicon.ico, icono táctil de Apple, iconos de Android y adaptables — más el manifiesto y las etiquetas para pegar. No se sube nada.',
    },
  },
  pt: {
    'compress-image': {
      name: 'Comprimir uma imagem até um peso',
      title: 'Comprima uma imagem para menos de 100 KB, 50 KB ou qualquer peso — Pare',
      description:
        'Deixe uma foto pequena o bastante para um formulário, um e-mail ou um chat: escolha um limite e o Pare coloca a imagem abaixo dele. No navegador, sem upload.',
      heading: ['Faça caber,', 'menos de 100 KB.'],
      lede: 'Escolha um limite — 20 KB, 50 KB, 100 KB ou o seu — e o Pare deixa cada imagem abaixo dele, reduzindo a qualidade primeiro e o tamanho só se precisar. Nada é enviado.',
    },
    'heic-to-jpg': {
      name: 'HEIC para JPG',
      title: 'Converta HEIC para JPG no navegador — Pare',
      description:
        'Transforme fotos HEIC do iPhone em JPG que abrem em qualquer lugar. Várias de uma vez, em tamanho cheio, com privacidade: as fotos nunca saem do seu navegador.',
      heading: ['HEIC para', 'JPG.'],
      lede: 'Solte fotos do iPhone e receba JPG que abrem em qualquer lugar, em tamanho cheio. Várias de uma vez, e nada é enviado — a conversão acontece nesta aba.',
    },
    'resize-image': {
      name: 'Redimensionar uma imagem',
      title: 'Redimensione imagens para qualquer largura ou altura — Pare',
      description:
        'Redimensione uma imagem ou centenas para largura e altura exatas, ajustadas ou cortadas, no navegador. Grátis, sem upload.',
      heading: ['No tamanho', 'que quiser.'],
      lede: 'Defina uma largura, uma altura ou as duas — ajustar dentro ou cortar para preencher — e cada imagem sai nesse tamanho. Nunca ampliada, nunca enviada.',
    },
    'convert-to-webp': {
      name: 'Converter para WebP',
      title: 'Converta JPG e PNG para WebP — Pare',
      description:
        'Converta imagens para WebP, geralmente bem menor que JPG ou PNG com a mesma aparência. Em lote, no navegador, sem upload.',
      heading: ['Converta para', 'WebP.'],
      lede: 'De JPG, PNG, HEIC e outros para WebP, em tamanho cheio — normalmente bem menor com a mesma aparência. Em lote, com privacidade, nesta aba.',
    },
    'convert-to-avif': {
      name: 'Converter para AVIF',
      title: 'Converta imagens para AVIF — Pare',
      description:
        'Converta imagens para AVIF, o menor formato que todo navegador atual lê. Em lote, no navegador, sem upload.',
      heading: ['Converta para', 'AVIF.'],
      lede: 'O menor formato de imagem que qualquer navegador atual lê. Solte JPG, PNG, HEIC ou WebP e receba AVIF em tamanho cheio, sem enviar nada.',
    },
    'make-favicon': {
      name: 'Criar um favicon',
      title: 'Crie um favicon e ícones de app a partir de uma imagem — Pare',
      description:
        'favicon.ico, ícone de toque da Apple, ícones Android e adaptáveis, o manifesto web e as tags para colar, a partir de uma imagem. No navegador, sem upload.',
      heading: ['Crie um', 'favicon.'],
      lede: 'Solte um logo ou uma imagem e receba todos os ícones que um site precisa — favicon.ico, ícone de toque da Apple, ícones Android e adaptáveis — além do manifesto e das tags para colar. Nada é enviado.',
    },
  },
  id: {
    'compress-image': {
      name: 'Kompres gambar ke ukuran tertentu',
      title: 'Kompres gambar di bawah 100 KB, 50 KB, atau ukuran apa pun — Pare',
      description:
        'Kecilkan foto agar muat untuk formulir unggah, email, atau chat: pilih batas dan Pare membuat gambar di bawahnya. Di browser Anda, tanpa unggah.',
      heading: ['Buat muat,', 'di bawah 100 KB.'],
      lede: 'Pilih batas — 20 KB, 50 KB, 100 KB, atau milik Anda — dan Pare membuat setiap gambar di bawahnya, menurunkan kualitas dulu dan ukuran hanya bila perlu. Tidak ada yang diunggah.',
    },
    'heic-to-jpg': {
      name: 'HEIC ke JPG',
      title: 'Ubah HEIC ke JPG di browser Anda — Pare',
      description:
        'Ubah foto HEIC dari iPhone menjadi JPG yang bisa dibuka di mana saja. Banyak sekaligus, ukuran penuh, pribadi: foto tidak pernah keluar dari browser Anda.',
      heading: ['HEIC ke', 'JPG.'],
      lede: 'Taruh foto iPhone dan dapatkan JPG yang bisa dibuka di mana saja, dalam ukuran penuh. Banyak sekaligus, dan tidak ada yang diunggah — konversi terjadi di tab ini.',
    },
    'resize-image': {
      name: 'Ubah ukuran gambar',
      title: 'Ubah ukuran gambar ke lebar atau tinggi berapa pun — Pare',
      description:
        'Ubah ukuran satu atau ratusan gambar ke lebar dan tinggi tertentu, dipaskan atau dipotong, di browser Anda. Gratis, tanpa unggah.',
      heading: ['Ubah ukuran', 'sesuka Anda.'],
      lede: 'Tentukan lebar, tinggi, atau keduanya — pas di dalam, atau potong untuk memenuhi — dan setiap gambar keluar dengan ukuran itu. Tidak pernah diperbesar, tidak pernah diunggah.',
    },
    'convert-to-webp': {
      name: 'Ubah ke WebP',
      title: 'Ubah JPG dan PNG ke WebP — Pare',
      description:
        'Ubah gambar ke WebP, biasanya jauh lebih kecil dari JPG atau PNG dengan tampilan yang sama. Sekaligus banyak, di browser, tanpa unggah.',
      heading: ['Ubah ke', 'WebP.'],
      lede: 'JPG, PNG, HEIC, dan lainnya ke WebP, ukuran penuh — biasanya jauh lebih kecil dengan tampilan yang sama. Sekaligus banyak, pribadi, di tab ini.',
    },
    'convert-to-avif': {
      name: 'Ubah ke AVIF',
      title: 'Ubah gambar ke AVIF — Pare',
      description:
        'Ubah gambar ke AVIF, format terkecil yang dibaca semua browser masa kini. Sekaligus banyak, di browser, tanpa unggah.',
      heading: ['Ubah ke', 'AVIF.'],
      lede: 'Format gambar terkecil yang dibaca setiap browser masa kini. Taruh JPG, PNG, HEIC, atau WebP dan dapatkan AVIF ukuran penuh, tanpa mengunggah apa pun.',
    },
    'make-favicon': {
      name: 'Buat favicon',
      title: 'Buat favicon dan ikon aplikasi dari satu gambar — Pare',
      description:
        'favicon.ico, ikon sentuh Apple, ikon Android dan maskable, manifest web, dan tag untuk ditempel, dari satu gambar. Di browser Anda, tanpa unggah.',
      heading: ['Buat', 'favicon.'],
      lede: 'Taruh logo atau gambar dan dapatkan setiap ikon yang dibutuhkan situs — favicon.ico, ikon sentuh Apple, ikon Android dan maskable — beserta manifest dan tag untuk ditempel. Tidak ada yang diunggah.',
    },
  },
};

/** A task's words in a language, English where a translation is missing. */
export function taskCopy(task: Task, lang: Lang): Copy {
  return (lang === 'en' ? undefined : TRANSLATED[lang][task.slug]) ?? task;
}
