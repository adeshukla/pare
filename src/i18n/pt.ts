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
};

export default pt;
