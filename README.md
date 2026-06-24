# ✈ Flight Price Tracker

Acompanhamento de preços de passagens Arajet e Avianca — Next.js 15 + Supabase + Vercel.

---

## 1. Supabase — criar a tabela

1. Abra o **SQL Editor** no painel do seu projeto Supabase (personal-hub).
2. Cole e execute o conteúdo de **`supabase-schema.sql`**.
3. A tabela `flight_prices` será criada com RLS habilitado.

> **Acesso público (sem login):** o arquivo SQL tem uma política comentada
> `"Public access"`. Se não quiser usar autenticação, comente a policy existente
> e descomente essa. Para uso pessoal é o mais prático.

---

## 2. Variáveis de ambiente

```bash
cp .env.example .env.local
```

Preencha com os valores de **Settings › API** do seu projeto Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

---

## 3. Rodar localmente

```bash
npm install
npm run dev
# acesse http://localhost:3000
```

---

## 4. Deploy no Vercel

```bash
# instale a CLI do Vercel se não tiver
npm i -g vercel

vercel
# siga o wizard — ele detecta Next.js automaticamente
```

Na dashboard do Vercel, adicione as mesmas variáveis de ambiente:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Estrutura do projeto

```
flight-tracker/
├── app/
│   ├── layout.tsx       # root layout
│   ├── page.tsx         # página principal
│   └── globals.css      # design system + variáveis
├── components/
│   ├── PriceForm.tsx    # formulário de inserção/edição
│   ├── PriceChart.tsx   # gráfico de variação (Recharts)
│   ├── PriceTable.tsx   # tabela com filtro, sort, edit e delete
│   └── StatsBar.tsx     # cards de mínimo e média por companhia
├── lib/
│   └── supabase.ts      # client + tipos
├── supabase-schema.sql
└── .env.example
```

---

## Funcionalidades

- Inserir preços com data, companhia (Arajet/Avianca), ida, volta e observação
- O campo **total** é calculado automaticamente pelo Supabase (coluna gerada)
- Gráfico de linha mostrando evolução do total por companhia
- Tabela com filtro por companhia e ordenação por data
- Destacar o **menor preço** de cada companhia na tabela (★ min em verde)
- Editar e deletar qualquer registro
- Cards de resumo: menor preço e média de cada companhia

---

## Aceita valores no formato brasileiro

O campo de preço aceita tanto `1.540,23` quanto `1540.23` — o parser
normaliza os separadores automaticamente.
