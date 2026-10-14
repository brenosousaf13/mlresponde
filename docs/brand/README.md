# Identidade visual — maanu

> Nome: **maanu** (sempre minúsculo; na logo, com o ponto teal: **maanu.**). No texto, tratamos como feminino:
> "a maanu", "na maanu".
> Assinatura: **Respostas automáticas com IA para marketplaces**. Slogan: **Mais conversas. Mais vendas. Menos trabalho.**
> Os textos centrais ficam em `lib/config/site.ts` — não espalhe o nome pelo código.

## Arquivos

| Arquivo | Uso |
|---|---|
| `docs/brand/maanu-apresentacao-da-marca.png` | Apresentação original da marca (referência de cores, tom e aplicações). |
| `docs/brand/maanu-logo-original.png`, `maanu-icone-m-original.png` | Arquivos originais enviados pelo Breno (base da vetorização). |
| `public/brand/maanu-logo.svg` / `.png` | Logo completa, letras grafite (fundo claro). |
| `public/brand/maanu-logo-branco.svg` / `.png` | Logo completa, letras brancas (fundo escuro). |
| `public/brand/maanu-m.svg`, `maanu-m-branco.svg` | Símbolo "m." (menu recolhido, espaços pequenos). |
| `public/brand/maanu-icone.svg`, `maanu-icone-512.png` | Ícone de app: "m." num quadrado branco arredondado. |
| `app/icon.svg`, `app/favicon.ico` | Favicon: "m." branco num quadrado grafite (aparece bem em abas claras e escuras). |
| `app/apple-icon.png` | Ícone da tela inicial do iPhone (o iOS arredonda). |
| `app/opengraph-image.png` | Imagem de compartilhamento de links (WhatsApp, redes sociais). |
| `docs/brand/onboarding/passo-1..4.png` | Ilustrações originais do tour de boas-vindas (1254 px, fundo transparente; `passo-2-com-fundo.png` é só referência). |
| `public/tour/passo-1..4.png` | As mesmas ilustrações recortadas, centralizadas e equilibradas (640 px) para o tour. Regerar com `node docs/brand/scripts/onboarding.mjs`. |
| `components/brand/logo.tsx` | `LogoWordmark` ("maanu.") e `LogoMark` ("m.") em SVG no próprio HTML: as letras usam a cor do texto (`text-white` em fundo escuro) e o ponto é sempre teal. |

Na interface, use sempre os componentes de `components/brand/logo.tsx` (não `<img>` dos PNGs). Os PNGs servem para
e-mails, redes sociais e materiais fora do app.

## Cores

| Nome | Hex | Token (Tailwind) | Onde |
|---|---|---|---|
| Graphite | `#0F172A` | `brand-graphite`, `foreground` | Texto, logo, fundos escuros (destaques, banner do teste). |
| Teal Green | `#1FAF9A` | `brand-teal`, `chart-1`, `ring` | Ponto da logo, a IA nos gráficos, destaques sobre fundo escuro, foco. |
| Teal (interface) | ≈ `#009682` | `primary` | Botões, links e estados ativos — um pouco mais fechado que o da logo para o texto ficar legível (branco sobre ele ≈ 3,7:1). |
| Teal tinta | ≈ `#006154` | `brand-teal-ink` | Texto teal sobre fundos claros/sage (contraste AA). |
| Off White | `#F8FAFC` | `brand-offwhite` | Fundos claros. |
| Soft Sage | `#DDEEE8` | `brand-sage` | Caixas de sucesso, avisos calmos, item ativo do menu (versão mais clara). |
| Slate | `#A0AEC0` | `brand-slate`, `chart-5` | Elementos secundários (ex.: faixa de horário comercial). |

| Teal aceso (página de vendas) | ≈ `#7FE3CF` | `brand-mint` | Brilhos, gradientes e destaques sobre o grafite na página de vendas (mais "vivo"). |
| Grafite fundo (página de vendas) | ≈ `#0B1220` | `brand-night` | Painéis escuros arredondados da página de vendas (topo, segurança, calculadora). |

- Os neutros da interface seguem a escala **slate** do Tailwind (o Graphite é o `slate-900`).
- Significado das cores nas telas de Perguntas/Pós-venda: **teal = IA**, **grafite/slate = você**, **âmbar = esperando
  você**, **violeta = mensagem padrão**, **vermelho = problema**.
- Tokens definidos em `app/globals.css` (`:root` e `.dark`).

## Tipografia

Interface em **Geist** (já usada pelo app; combina com a logo geométrica). A logo é desenho próprio — nunca recriar
com fonte.

**Página de vendas** (`app/(site)`, desde a Sessão 25): títulos em **Funnel Display** (`font-display`, carregada só nas
rotas do site; no app cai na Geist), texto corrido em Geist e rótulos técnicos (horários, tempos, "COMO FUNCIONA") em
Geist Mono. Animações e efeitos em `app/(site)/site.css` (todas respeitam "reduzir movimento").

## Regenerar os arquivos

Se a logo mudar, troque os originais em `docs/brand/` e rode os scripts de `docs/brand/scripts/` (veja o cabeçalho de
cada um): `vetorizar.py` transforma os
PNGs originais em vetores (`potracer`) e `gerar.mjs` cria os SVG/PNG/ICO e `components/brand/logo-paths.ts`.
