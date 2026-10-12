# AGENTS.md — Porta de entrada para qualquer IA (Claude, ChatGPT/Codex e outras)

## Leia antes de qualquer coisa
1. Leia **`CEREBRO.md`** por inteiro: visão do produto, estado atual, arquitetura, modelo de dados,
   problemas conhecidos, decisões, diário de sessões e próximos passos.
2. Ao terminar qualquer tarefa que mude código, banco, infraestrutura, escopo ou decisões,
   **atualize o `CEREBRO.md`** (estado atual, problemas resolvidos, decisões, nova entrada no diário e próximos passos).
   Sessão que não atualiza o cérebro está incompleta.

## Regras inegociáveis (detalhes no `CEREBRO.md` §2)
- **Desde a Sessão 15 (2026-10-12) existem DUAS produções** (a troca está em andamento, ver `CEREBRO.md` §13 item 0a):
  - `main` = **v1** (projeto Vercel `mlresponde`, clientes antigos, será desligada). Não fazer push/merge na `main`
    sem aprovação explícita do Breno.
  - **`v2` = PRODUÇÃO da v2**: todo push na `v2` publica em **`maanu.com.br`** (projeto Vercel `maanu`) para cliente real.
    A IA continua com autonomia na `v2` (decide, implementa, commit e push), mas **só faz push com as 4 verificações
    passando**; mudança grande ou arriscada vai antes para uma branch `codex/...` (não publica em lugar nenhum).
- **UI sempre com shadcn/ui** (https://ui.shadcn.com/docs/components) — componentes e blocks; preset `base-nova` (Base UI).
- **Marca: maanu** (sempre minúsculo). Siga `docs/brand/README.md`: logo só por `components/brand/logo.tsx`, nome em
  `lib/config/site.ts`, cores pelos tokens do tema (`primary`, `brand-*`) — não use cores soltas para a marca.
- Antes de entregar: `npm run typecheck`, `npm test`, `npm run lint` e `npm run build`.
- **O Supabase da v2 (`ookosqyfazobiwmopiix`) é o banco de PRODUÇÃO** (dados de clientes reais; o `.env.local` aponta
  para ele): nada destrutivo (DROP, RENAME, troca de tipo, apagar dados) sem aprovação do Breno; schema só por migração
  versionada. **Toda tabela, view ou função nova precisa de `GRANT` explícito** para `authenticated` (os privilégios
  padrão são negados de propósito, `CEREBRO.md` §6.1f). O banco da v1 é só leitura e não recebe migrações da v2.
- Nunca commitar ou registrar segredos (`.env*`, tokens, chaves).
- Fale com o Breno em português (BR), de forma direta.

## Recursos no repositório
- Skills de agentes em `.agents/skills/` (ex.: `supabase-postgres-best-practices`, `vercel-react-best-practices`, `frontend-design`).
- `instructions.md` é **histórico** (guia original da v1) e está desatualizado — não siga suas regras de fases.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->