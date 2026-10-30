import type { Strings } from '../i18n';

/** Loaded only on pages in this language (ADR-041). */
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
  englishNote: "Algumas notas técnicas ainda estão em inglês.",

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
    `Para imagens, o menor formato em tamanho cheio que o navegador lê; para fontes divididas, só o primeiro arquivo; para código, o próprio arquivo minificado. O zip tem ${zip} com todas as variantes — ninguém baixa tudo.`,
  compressedNote: (size) =>
    `Se o seu servidor também comprimir o código (gzip ou brotli), enviaria cerca de ${size}. É uma estimativa: os arquivos que você salva não têm esse tamanho, e as cópias .gz e .br só ajudam quando o servidor está configurado para enviá-las.`,
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
  formPresets: "Para um formulário",
  formPhoto: "Foto para formulário",
  signature: "Assinatura",
  passport: "Foto de passaporte",
  avatar: "Foto de perfil",
  presetsHint: "Cada formulário é diferente: confira o tamanho que o seu pede.",
  exactSize: "Tamanho exato, em pixels (opcional)",
  width: "Largura",
  height: "Altura",
  exactSizeHint: "Com os dois, o centro da imagem é cortado nesse formato. Depois o Pare só reduz a qualidade — o tamanho fica exato — e avisa se não couber no limite.",
  notes: {
    savedAsJpeg: () => 'Salva como JPEG: um PNG não troca qualidade por peso, e esta imagem não tem transparência, então nada visível se perde.',
    couldNotFit: (format, limit, smallest) => `Não foi possível deixar o ${format} abaixo de ${limit}. O menor que o Pare conseguiu foi ${smallest}.`,
    madeSmaller: (limit, format, w, h, fw, fh) => `Para ficar abaixo de ${limit}, o ${format} ficou com ${w}×${h} (de ${fw}×${fh}).`,
    savedAtQuality: (format, q, max, limit) => `O ${format} foi salvo com qualidade ${q} (de ${max}) para ficar abaixo de ${limit}.`,
    cropped: (w, h, fw, fh) => `Cortada para ${w}×${h} a partir do centro da imagem de ${fw}×${fh}.`,
    tooSmallForBox: (w, h, ow, oh) => `Esta imagem é menor que ${w}×${h}, então ficou com ${ow}×${oh}: o Pare nunca amplia uma imagem.`,
    tiffPages: (n) => `Este TIFF tem ${n} páginas; só a primeira foi convertida.`,
    alreadySmall: () => 'Já está o menor possível — o original foi mantido.',
    biggerKept: (meta) => (meta ? 'Recodificar em tamanho cheio deixou o arquivo maior, então o original foi mantido, sem os dados da câmera.' : 'Recodificar em tamanho cheio deixou o arquivo maior, então o original foi mantido.'),
    unreadable: () => 'Não foi possível ler este arquivo — pode estar danificado, grande demais para esta aba ou num formato que este navegador não lê. Foi copiado sem mudança.',
    tooLargeToRead: (w) => `Esta imagem era grande demais para trabalhar em tamanho cheio, então foi lida com ${w} px de largura. O maior arquivo tem essa largura.`,
    iconsSquare: (s1, s2, w, h) => `Ícones são quadrados, então foi usado o centro de ${s1}×${s2} desta imagem de ${w}×${h}.`,
    iconsSmall: (side) => `Esta imagem tem ${side} px, então os ícones maiores (até 512 px) são ampliados e podem ficar borrados. Um original de 512 px ou mais dá ícones nítidos.`,
    iconsPlace: () => 'Coloque estes arquivos na raiz do seu site e troque o nome em manifest.webmanifest pelo nome do seu site.',
    maskableWhite: () => 'O ícone adaptável fica sobre branco, porque esta imagem não tem uma cor de fundo sólida própria.',
    animation: (frames, gif) => `Mantida como animação (${frames} quadros) no próprio tamanho: um WebP animado${gif ? ', com o GIF original para os navegadores que não o mostram' : ''}.`,
    animationBigger: () => 'O WebP animado não ficou menor que este GIF, então o GIF foi mantido sem mudança.',
    animationTarget: () => 'Este GIF é animado, e uma animação não fica abaixo de um peso sem perder quadros. Foi copiado sem mudança.',
    minified: (rest) => 'minificado' + rest,
    copiedUnchanged: () => 'copiado sem mudança',
    fontFiles: (n, c) => `${n} arquivos · ${c} caracteres`,
    fontOf: (a, b) => `${a} de ${b} caracteres`,
  },
};

export default pt;
