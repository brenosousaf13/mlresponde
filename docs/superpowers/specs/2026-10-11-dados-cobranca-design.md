# Dados de cobrança no cadastro (CPF/CNPJ + endereço) — design

- **Data:** 2026-10-11 · **Status:** implementado na branch `v2` (decisões técnicas delegadas à IA pelo Breno)
- **Pedido do Breno:** coletar CPF/CNPJ e endereço dos clientes no cadastro ("até mesmo pra fazer a cobrança certinho"),
  com campos para atualizar em Configurações. O CPF/CNPJ **não pode ser alterado** depois de cadastrado e vinculado ao
  e-mail, e é **único por conta**.

## 1. Onde os dados são pedidos

- **Cadastro = 2 etapas depois de confirmar o e-mail** (`/onboarding`):
  1. *Sua loja*: nome da loja + WhatsApp (como antes; não conclui mais o cadastro sozinha).
  2. *Dados para cobrança*: tipo (pessoa física/jurídica), CPF ou CNPJ, nome completo/razão social e endereço
     (CEP, rua, número, complemento, bairro, cidade, UF). "Concluir cadastro" → `/contas` (tour).
  - "Voltar" na etapa 2 reabre a etapa 1 (`?etapa=loja`) com os dados já salvos.
- **Por que depois da confirmação do e-mail, e não na tela `/cadastro`:** o documento só pode ser gravado por uma conta
  com e-mail comprovado. Se fosse na primeira tela, um e-mail digitado errado (que nunca é confirmado) prenderia o CPF
  numa conta morta, e qualquer pessoa poderia "reservar" o CPF/CNPJ de outra sem provar o e-mail. A tela de cadastro
  continua curta (nome, e-mail, senha), o que ajuda na conversão.
- **Contas que já existiam** (onboarding feito antes desta mudança, inclusive as da v1 no cutover): no próximo acesso
  caem em `/onboarding` com uma etapa única "Complete seu cadastro". Só o dono/administrador da organização precisa
  preencher; **membros comuns** e o **admin da plataforma** (`is_platform_admin`, ex.: "Loja Demonstração") são dispensados.
- **Bloqueio no servidor:** `requireOnboardedContext` → `needsOnboarding(context)` (falta onboarding OU, para quem
  administra a loja, faltam os dados de cobrança). Vale para todas as páginas/ações da área logada e para
  `/api/ml/oauth/start`.
- **Configurações:** card "Dados de cobrança" (só dono/administrador): documento **travado** (cadeado + "vinculado desde
  dd/mm/aaaa; fale com o suporte"), nome/razão social e endereço editáveis. Sem cadastro (admin da plataforma), o card
  mostra o formulário completo.

## 2. Regras do documento

- **CPF:** 11 dígitos, módulo 11, recusa sequências repetidas.
- **CNPJ:** numérico **e alfanumérico** (Receita Federal, emitido desde julho/2026): 12 posições A–Z/0–9 + 2 dígitos
  verificadores numéricos; cada caractere vale `ASCII − 48` no módulo 11 (o mesmo cálculo valida o CNPJ antigo).
  Máscara `00.000.000/0000-00` aceita letras; letras minúsculas viram maiúsculas.
- Gravado normalizado (sem pontuação, maiúsculas). A mesma validação existe em TypeScript
  (`lib/billing/documents.ts`) e no banco (`is_valid_tax_document`, CHECK da tabela).
- **Único na plataforma** (`unique (document)`): "Este CPF já está cadastrado em outra conta. Se ela é sua, entre com o
  e-mail dessa conta ou fale com o suporte." (não revela qual e-mail).
- **Imutável:** trigger `protect_billing_document` bloqueia trocar `document`/`document_type` (e a organização) até
  para o service role (erro `BILLING_DOCUMENT_LOCKED`). O servidor também ignora qualquer documento enviado quando já
  existe cadastro. **Correção pelo suporte** (erro de digitação comprovado), só por SQL no banco:
  `begin; set local app.allow_billing_document_change = 'on'; update public.billing_profiles set document = '...' where organization_id = '...'; commit;`
- **Confirmação antes de gravar:** ao salvar um documento válido pela primeira vez, abre um `AlertDialog` com o
  documento formatado, o nome e o e-mail da conta ("não poderá ser alterado"). Documento inválido vai direto para o
  servidor, que devolve o erro no campo.

## 3. Endereço

- CEP com máscara; ao completar 8 números, o **navegador** consulta o ViaCEP (BrasilAPI se o ViaCEP falhar; 5 s de
  limite) e preenche rua, bairro, cidade e UF, levando o foco para o número (ou para a rua, em CEP geral de cidade).
  Falhou ou não achou: aviso discreto e preenchimento manual. Link "Não sei o CEP" (Busca CEP dos Correios).
- Validação no servidor (zod): nome 2–150, CEP 8 números, rua 2–150, número 1–20 ("S/N" aceito), complemento ≤ 80
  (opcional), bairro 1–80, cidade 2–80, UF entre as 27. Espaços repetidos são removidos.

## 4. Banco (migração `20261011235000_dados_cobranca.sql`, aditiva)

- `billing_profiles` (1 por organização, `organization_id` PK/FK `on delete cascade`): `document_type` (`cpf|cnpj`),
  `document` (único + CHECK de validade), `legal_name`, `postal_code`, `street`, `address_number`, `complement`,
  `district`, `city`, `state`, `registered_by` (quem gravou o documento), `created_at` (= data do vínculo), `updated_at`.
- Tabela separada de `organizations` de propósito: é dado pessoal (LGPD) e só dono/administrador lê
  (`current_user_managed_organization_ids()`, security definer). Membros comuns não veem o CPF do dono.
- Navegador só lê (RLS); escrita só pelo servidor (service role) depois de checar sessão e papel.
- Testes: `supabase/tests/cobranca_rls.sql` (validação de CPF/CNPJ no banco, documento inválido, duplicado, imutável,
  correção do suporte, isolamento entre lojas, membro comum, anon).

## 5. Código

- `lib/billing/documents.ts` (puro): validação, máscaras, formatação, UFs. `lib/billing/cep.ts`: busca de CEP.
- `lib/validation/billing.ts`: `parseBillingProfile(input, { withDocument })` e `billingSaveError`.
- `lib/dal/billing.ts` (server-only): `getBillingProfile` (sessão + RLS) e `saveBillingProfile` (service role;
  trata duplicado e envio duplo).
- `components/billing/billing-profile-form.tsx`: formulário único (cadastro e Configurações; `columns` lado a lado).
- `app/onboarding/{page,actions}.ts(x)`: etapas; `app/(app)/configuracoes`: card e `updateBillingProfile`.
- `lib/dal/app-context.ts`: `billing: { required, completed }` (embed `billing_profiles(organization_id)` na mesma
  consulta da organização) e `needsOnboarding`.
- Política de Privacidade (rascunho) passou a listar os dados de cobrança e a finalidade.

## 6. Fora do escopo / próximos passos

- Gateway de pagamento e nota fiscal (sub-projeto 4) vão ler `billing_profiles` (nome, documento e endereço já no
  formato que Asaas/Stripe/emissores pedem).
- Inscrição estadual/municipal, e-mail financeiro separado e consulta do CNPJ na Receita (preencher razão social
  sozinho) — avaliar com o gateway escolhido.
- Tela de suporte/admin para corrigir documento (hoje só SQL).
