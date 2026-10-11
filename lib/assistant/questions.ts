/**
 * Roteiro da configuração guiada do assistente de IA.
 * As respostas ficam em `ml_accounts.store_profile` e viram o "conhecimento da loja" no prompt (ver profile.ts).
 * Os ids são estáveis: mudar um id faz a resposta antiga deixar de aparecer.
 */

export type SetupOption = {
  value: string
  label: string
  /** Como a escolha entra no prompt. Vazio = não entra (ex.: "não se aplica"). */
  fact: string
}

export type ProfileQuestion = {
  id: string
  section: SetupSectionId
  /** Rótulo curto (lista de conhecimento e prompt). */
  label: string
  title: string
  description: string
  /** text = campo curto; textarea = texto livre; choice/multi = opções + detalhes opcionais. */
  kind: "text" | "textarea" | "choice" | "multi"
  options?: SetupOption[]
  placeholder: string
  detailsLabel?: string
  maxLength: number
  required?: boolean
}

export type StyleStep = {
  id: "tone" | "affixes" | "mode" | "threshold"
  section: "estilo"
  label: string
  title: string
  description: string
  /** Descrição quando o modo "responder sempre" está ligado. */
  alwaysDescription?: string
}

export type SetupStep = ({ type: "question" } & ProfileQuestion) | ({ type: "style" } & StyleStep)

export const SETUP_SECTIONS = [
  { id: "loja", label: "Sua loja" },
  { id: "produtos", label: "Produtos" },
  { id: "envio", label: "Envio e retirada" },
  { id: "pagamento", label: "Pagamento e nota" },
  { id: "pos_venda", label: "Garantia e trocas" },
  { id: "atendimento", label: "Atendimento" },
  { id: "estilo", label: "Jeito de responder" },
] as const

export type SetupSectionId = (typeof SETUP_SECTIONS)[number]["id"]

export const PROFILE_QUESTIONS: ProfileQuestion[] = [
  {
    id: "store_name",
    section: "loja",
    label: "Nome da loja",
    title: "Qual é o nome da sua loja?",
    description: "É o nome que a IA usa quando precisa falar da loja.",
    kind: "text",
    placeholder: "Ex.: Casa da Bike",
    maxLength: 80,
    required: true,
  },
  {
    id: "store_about",
    section: "loja",
    label: "O que a loja vende",
    title: "O que a sua loja vende?",
    description:
      "Explique em poucas linhas os produtos, para quem você vende e o que diferencia a loja. Isso dá contexto para todas as respostas.",
    kind: "textarea",
    placeholder:
      "Ex.: Moda feminina jeans, do 34 ao 46. Fabricação própria no Brás (SP), há 10 anos no mercado. Público: mulheres que buscam conforto.",
    maxLength: 1500,
  },
  {
    id: "product_origin",
    section: "loja",
    label: "Origem dos produtos",
    title: "De onde vêm os seus produtos?",
    description: "Compradores perguntam muito se o produto é original, de qual marca e se tem garantia de fábrica.",
    kind: "multi",
    options: [
      { value: "fabricacao_propria", label: "Fabricação própria", fact: "Os produtos são de fabricação própria" },
      { value: "revenda_marcas", label: "Revenda de marcas", fact: "A loja revende produtos de marcas" },
      { value: "originais", label: "Originais e lacrados", fact: "Os produtos são originais e lacrados" },
      { value: "importados", label: "Importados", fact: "A loja trabalha com produtos importados" },
      { value: "artesanal", label: "Feitos à mão", fact: "Os produtos são feitos à mão (artesanais)" },
      {
        value: "usados",
        label: "Usados ou recondicionados",
        fact: "A loja também vende produtos usados ou recondicionados (a condição aparece em cada anúncio)",
      },
    ],
    placeholder: "Ex.: Somos revenda autorizada Caloi e Shimano. Todos com nota e garantia de fábrica.",
    detailsLabel: "Detalhes (opcional)",
    maxLength: 1500,
  },
  {
    id: "product_details",
    section: "produtos",
    label: "Detalhes confirmados dos produtos",
    title: "O que os compradores sempre perguntam e nem sempre está no anúncio?",
    description:
      "Escreva detalhes confirmados: medidas, materiais, se vem montado, voltagem, compatibilidade, o que vem na caixa. Se um detalhe vale só para um modelo, comece a linha com o nome do modelo.",
    kind: "textarea",
    placeholder: [
      "Ex.:",
      "Calça Mom: os bolsos da frente são só decorativos; os de trás são funcionais.",
      "Cargo Jogger: 2 bolsos na frente e 2 laterais, não tem bolso atrás.",
      "Todas as bicicletas vêm 90% montadas (falta encaixar guidão e pedais).",
    ].join("\n"),
    maxLength: 6000,
  },
  {
    id: "sizing",
    section: "produtos",
    label: "Como escolher tamanho ou medida",
    title: "Como o comprador deve escolher tamanho ou medida?",
    description: "A IA nunca recomenda um tamanho que não esteja sustentado pelas informações que você der aqui ou pelo anúncio.",
    kind: "multi",
    options: [
      {
        value: "tabela",
        label: "Pela tabela do anúncio",
        fact: "Para escolher tamanho, oriente o comprador a consultar a tabela de medidas do anúncio",
      },
      {
        value: "normal",
        label: "Veste/serve normal",
        fact: "Os produtos seguem a numeração padrão: o comprador pode escolher o tamanho que costuma usar",
      },
      {
        value: "pequeno",
        label: "Forma pequena",
        fact: "A forma é pequena: oriente o comprador a escolher um tamanho acima do habitual",
      },
      {
        value: "grande",
        label: "Forma grande",
        fact: "A forma é grande: oriente o comprador a escolher um tamanho abaixo do habitual",
      },
      { value: "nao_se_aplica", label: "Não se aplica", fact: "" },
    ],
    placeholder: [
      "Ex.:",
      "34 = PP, 36 = P, 38 = M, 40 = G, 42 = GG.",
      "Referência de altura: 36 serve de 1,52 m a 1,63 m; 38 de 1,55 m a 1,66 m.",
    ].join("\n"),
    detailsLabel: "Tabela ou referências (opcional)",
    maxLength: 3000,
  },
  {
    id: "restock",
    section: "produtos",
    label: "Reposição de estoque",
    title: "Quando um produto ou variação esgota, você repõe?",
    description: "A IA nunca promete data de reposição que você não tenha informado.",
    kind: "choice",
    options: [
      { value: "sim", label: "Sim, costumamos repor", fact: "A loja costuma repor produtos e variações esgotados, sem data garantida" },
      { value: "as_vezes", label: "Às vezes", fact: "Alguns produtos voltam ao estoque, sem previsão garantida" },
      { value: "nao", label: "Não, quando acaba, acabou", fact: "Produtos esgotados normalmente não voltam ao estoque" },
    ],
    placeholder: "Ex.: A reposição costuma levar de 15 a 20 dias, mas não prometemos data.",
    detailsLabel: "Detalhes (opcional)",
    maxLength: 1000,
  },
  {
    id: "custom_orders",
    section: "produtos",
    label: "Personalização, encomendas e orçamentos",
    title: "Você faz personalização, encomenda ou orçamento?",
    description: "Quando a resposta for sim, esses pedidos sempre ficam para você responder.",
    kind: "choice",
    options: [
      {
        value: "sim",
        label: "Sim",
        fact: "A loja faz personalização, encomendas ou orçamentos — esses pedidos ficam sempre com o vendedor",
      },
      {
        value: "nao",
        label: "Não",
        fact: "A loja não faz personalização, encomendas nem orçamentos: vende apenas o que está nos anúncios",
      },
    ],
    placeholder: "Ex.: Fazemos gravação de nome em capacetes, sob encomenda.",
    detailsLabel: "Detalhes (opcional)",
    maxLength: 1000,
  },
  {
    id: "shipping_methods",
    section: "envio",
    label: "Formas de envio",
    title: "Quais formas de envio você usa?",
    description: "Cada anúncio já informa a forma de envio dele. Aqui vale o que é comum para a loja.",
    kind: "multi",
    options: [
      { value: "full", label: "Full", fact: "Mercado Envios Full (o Mercado Livre armazena e despacha)" },
      { value: "coleta", label: "Coleta", fact: "Mercado Envios com coleta (o Mercado Livre busca os pacotes na loja)" },
      { value: "agencia", label: "Agência / ponto de postagem", fact: "Mercado Envios com postagem em agência ou ponto parceiro" },
      { value: "flex", label: "Flex", fact: "Mercado Envios Flex (entrega rápida feita pela loja na região)" },
      { value: "proprio", label: "Envio próprio / a combinar", fact: "Envio próprio ou a combinar em alguns produtos" },
    ],
    placeholder: "Ex.: Flex só para a cidade de São Paulo. Produtos grandes vão por transportadora.",
    detailsLabel: "Detalhes (opcional)",
    maxLength: 1500,
  },
  {
    id: "dispatch_time",
    section: "envio",
    label: "Prazo para despachar",
    title: "Depois da compra, em quanto tempo o pedido é despachado?",
    description:
      "O prazo de entrega o comprador vê no anúncio informando o CEP. Aqui é o tempo que a loja leva para postar ou despachar.",
    kind: "choice",
    options: [
      { value: "mesmo_dia", label: "No mesmo dia", fact: "Os pedidos são despachados no mesmo dia da compra" },
      { value: "1_dia", label: "Até 1 dia útil", fact: "Os pedidos são despachados em até 1 dia útil após a confirmação do pagamento" },
      { value: "2_dias", label: "Até 2 dias úteis", fact: "Os pedidos são despachados em até 2 dias úteis após a confirmação do pagamento" },
      { value: "3_mais", label: "3 dias úteis ou mais", fact: "Os pedidos levam 3 dias úteis ou mais para serem despachados (ver detalhes)" },
      { value: "varia", label: "Depende do produto", fact: "O prazo de despacho depende do produto" },
    ],
    placeholder: "Ex.: Compras até 13h saem no mesmo dia. No Full, quem despacha é o Mercado Livre.",
    detailsLabel: "Detalhes (opcional)",
    maxLength: 1000,
  },
  {
    id: "pickup",
    section: "envio",
    label: "Loja física e retirada",
    title: "Você tem loja física? Aceita retirada?",
    description:
      "Não escreva endereço completo, telefone ou redes sociais: o Mercado Livre proíbe passar contato nas respostas.",
    kind: "choice",
    options: [
      {
        value: "retirada",
        label: "Aceito retirada",
        fact: "A loja aceita retirada pessoalmente, combinada depois da compra pelo Mercado Livre",
      },
      {
        value: "loja_sem_retirada",
        label: "Tenho loja física, sem retirada",
        fact: "A loja tem loja física, mas não faz retirada nem trocas de pedidos do Mercado Livre na loja",
      },
      { value: "online", label: "Só vendo online", fact: "A loja não tem loja física e não aceita retirada" },
    ],
    placeholder: "Ex.: Retirada em Pinheiros, São Paulo/SP, de segunda a sexta. Combinamos pelo chat do pedido.",
    detailsLabel: "Detalhes (opcional)",
    maxLength: 1000,
  },
  {
    id: "invoice",
    section: "pagamento",
    label: "Nota fiscal",
    title: "Você emite nota fiscal?",
    description: "Pagamento e parcelamento são sempre feitos pelo Mercado Livre.",
    kind: "choice",
    options: [
      { value: "sempre", label: "Sim, em todos os pedidos", fact: "A loja emite nota fiscal em todos os pedidos" },
      { value: "quando_pedem", label: "Só quando pedem", fact: "A loja emite nota fiscal quando o comprador pede" },
      { value: "nao", label: "Não emitimos", fact: "A loja não emite nota fiscal" },
    ],
    placeholder: "Ex.: Para nota em CNPJ, o comprador informa os dados no momento da compra.",
    detailsLabel: "Detalhes (opcional)",
    maxLength: 1000,
  },
  {
    id: "discounts",
    section: "pagamento",
    label: "Descontos e atacado",
    title: "Você dá desconto para quantidade ou vende no atacado?",
    description: "Pedidos de desconto ficam para você, a não ser que exista uma regra clara aqui.",
    kind: "choice",
    options: [
      {
        value: "nao",
        label: "Não, só o preço do anúncio",
        fact: "A loja não dá desconto nem vende no atacado: valem o preço e as condições do anúncio",
      },
      {
        value: "quantidade",
        label: "Desconto por quantidade",
        fact: "A loja pode dar desconto para compras em quantidade — esses pedidos ficam sempre com o vendedor",
      },
      {
        value: "atacado",
        label: "Vendo no atacado",
        fact: "A loja vende no atacado — esses pedidos ficam sempre com o vendedor",
      },
    ],
    placeholder: "Ex.: Acima de 5 unidades, o desconto é combinado com o vendedor.",
    detailsLabel: "Detalhes (opcional)",
    maxLength: 1000,
  },
  {
    id: "warranty",
    section: "pos_venda",
    label: "Garantia",
    title: "Qual é a garantia dos produtos?",
    description: "Se um anúncio informar outra garantia, a IA usa a do anúncio.",
    kind: "choice",
    options: [
      { value: "loja", label: "Garantia da loja", fact: "Os produtos têm garantia da loja" },
      { value: "fabrica", label: "Garantia de fábrica", fact: "Os produtos têm garantia de fábrica" },
      { value: "ambas", label: "Loja e fábrica", fact: "Os produtos têm garantia da loja e de fábrica" },
      { value: "sem", label: "Sem garantia própria", fact: "A loja não oferece garantia própria (vale a política do Mercado Livre)" },
    ],
    placeholder: "Ex.: 90 dias contra defeitos de fabricação. O pedido de garantia é feito pelo Mercado Livre.",
    detailsLabel: "Prazo e o que cobre",
    maxLength: 1000,
  },
  {
    id: "returns",
    section: "pos_venda",
    label: "Trocas e devoluções",
    title: "Como funcionam trocas e devoluções?",
    description: "A IA usa isso para orientar quem quer trocar tamanho, cor ou desistir da compra.",
    kind: "choice",
    options: [
      { value: "troca", label: "Fazemos troca", fact: "A loja faz troca de produtos (ver condições)" },
      {
        value: "devolucao_ml",
        label: "Só devolução pelo Mercado Livre",
        fact: "A loja não faz troca direta: o comprador devolve pelo Mercado Livre (em Minhas compras) e faz um novo pedido",
      },
    ],
    placeholder:
      "Ex.: Até 7 dias após o recebimento, produto sem uso e com etiqueta. Mais de um produto: um pacote para cada devolução.",
    detailsLabel: "Condições (opcional)",
    maxLength: 1500,
  },
  {
    id: "service_hours",
    section: "atendimento",
    label: "Horário de atendimento",
    title: "Qual é o horário de atendimento da loja?",
    description: "Usado quando o comprador pergunta se vocês trabalham ou despacham em certos dias.",
    kind: "text",
    placeholder: "Ex.: Segunda a sexta, das 9h às 18h. Sábado até 12h.",
    maxLength: 300,
  },
  {
    id: "special_rules",
    section: "atendimento",
    label: "Regras especiais",
    title: "Tem alguma regra especial para a IA seguir?",
    description:
      "O que ela deve sempre fazer ou nunca dizer. As travas de segurança (não inventar, não passar contato, não negociar) já vêm ligadas.",
    kind: "textarea",
    placeholder: [
      "Ex.:",
      "Sempre recomendar a tabela de medidas antes de indicar um tamanho.",
      "Se perguntarem de kit com 2 unidades, dizer que temos um anúncio próprio para kit.",
      "Nunca falar sobre a marca X.",
    ].join("\n"),
    maxLength: 3000,
  },
]

export const STYLE_STEPS: StyleStep[] = [
  {
    id: "tone",
    section: "estilo",
    label: "Tom das respostas",
    title: "Como a IA deve falar com os compradores?",
    description: "Escolha o tom que combina com a sua loja.",
  },
  {
    id: "affixes",
    section: "estilo",
    label: "Saudação e assinatura",
    title: "Como começar e terminar as respostas?",
    description:
      "Elas entram em todas as respostas, inclusive para quem já comprou. Evite frases como \"Aguardamos sua compra\".",
  },
  {
    id: "mode",
    section: "estilo",
    label: "Quando a IA não souber",
    title: "O que fazer quando a IA não souber a resposta?",
    description:
      "Por padrão, a pergunta fica para você responder. Se prefere rapidez, ligue \"Responder sempre\": o comprador recebe na hora uma mensagem avisando que a loja não tem essa informação.",
  },
  {
    id: "threshold",
    section: "estilo",
    label: "Quanta certeza a IA precisa ter",
    title: "Quanta certeza a IA precisa ter para usar a resposta dela?",
    description:
      "Se ela não tiver certeza suficiente, a pergunta fica para você em Perguntas, já com um rascunho pronto.",
    alwaysDescription: "Se ela não tiver certeza suficiente, o comprador recebe a mensagem padrão em vez da resposta dela.",
  },
]

export const SETUP_STEPS: SetupStep[] = [
  ...PROFILE_QUESTIONS.map((question) => ({ type: "question" as const, ...question })),
  ...STYLE_STEPS.map((step) => ({ type: "style" as const, ...step })),
]

export const SETUP_STEP_COUNT = SETUP_STEPS.length

export function findQuestion(id: string): ProfileQuestion | undefined {
  return PROFILE_QUESTIONS.find((question) => question.id === id)
}

export function sectionLabel(id: SetupSectionId): string {
  return SETUP_SECTIONS.find((section) => section.id === id)?.label ?? ""
}
