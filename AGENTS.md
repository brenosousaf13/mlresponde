# AGENTS.md — Porta de entrada para qualquer IA (Claude, ChatGPT/Codex e outras)

## Leia antes de qualquer coisa
1. Leia **`CEREBRO.md`** por inteiro: visão do produto, estado atual, arquitetura, modelo de dados,
   problemas conhecidos, decisões, diário de sessões e próximos passos.
2. Ao terminar qualquer tarefa que mude código, banco, infraestrutura, escopo ou decisões,
   **atualize o `CEREBRO.md`** (estado atual, problemas resolvidos, decisões, nova entrada no diário e próximos passos).
   Sessão que não atualiza o cérebro está incompleta.

## Regras inegociáveis (detalhes no `CEREBRO.md` §2)
- O app **está em produção**: a branch `main` faz deploy automático na Vercel para clientes reais.
  Não fazer push/merge na `main` sem aprovação explícita do Breno.
- A v2 é desenvolvida na branch **`v2`** (staging `mlresponde-v2.vercel.app`, Supabase e app ML de **testes**).
  Nela a IA tem autonomia: decide, implementa, testa, faz commit e push sem pedir aprovação de plano.
- **UI sempre com shadcn/ui** (https://ui.shadcn.com/docs/components) — componentes e blocks; preset `base-nova` (Base UI).
- **Marca: maanu** (sempre minúsculo). Siga `docs/brand/README.md`: logo só por `components/brand/logo.tsx`, nome em
  `lib/config/site.ts`, cores pelos tokens do tema (`primary`, `brand-*`) — não use cores soltas para a marca.
- Antes de entregar: `npm run typecheck`, `npm test`, `npm run lint` e `npm run build`.
- O banco Supabase de produção é compartilhado com a v1: nada destrutivo (DROP, RENAME, troca de tipo, apagar dados).
  Mudanças de schema só por migração versionada, aditiva e retrocompatível.
- Nunca commitar ou registrar segredos (`.env*`, tokens, chaves).
- Fale com o Breno em português (BR), de forma direta.

## Recursos no repositório
- Skills de agentes em `.agents/skills/` (ex.: `supabase-postgres-best-practices`, `vercel-react-best-practices`, `frontend-design`).
- `instructions.md` é **histórico** (guia original da v1) e está desatualizado — não siga suas regras de fases.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->