# maanu

**Respostas automáticas com IA para marketplaces.** Mais conversas. Mais vendas. Menos trabalho.

A maanu responde, com IA, as perguntas e as mensagens de pós-venda dos compradores nos anúncios do Mercado Livre, usando
os dados do anúncio, as regras da loja e o histórico de respostas do vendedor.

- Stack: Next.js 16 (App Router) · React 19 · Tailwind v4 + shadcn/ui · Supabase · OpenAI.
- Antes de trabalhar no código, leia [`AGENTS.md`](AGENTS.md) e [`CEREBRO.md`](CEREBRO.md) (estado do projeto, regras e decisões).
- Identidade visual: [`docs/brand/README.md`](docs/brand/README.md).

```bash
npm ci
npm run dev        # http://localhost:3000 (usa .env.local; modelo em .env.example)
npm run typecheck && npm test && npm run lint && npm run build
```
