# LeadMapa — Prospecção de empresas sem site

Sistema de prospecção que encontra **empresas locais que ainda não têm site**
(seus leads mais quentes) usando dados reais do Google Maps, em tempo real,
sem precisar importar planilhas manualmente.

O sistema é dividido em três partes que compartilham a **mesma API**:

| Parte | Pasta | O que é |
|-------|-------|---------|
| **Backend / API** | [`backend/`](backend/) | Orquestra o scraper do Google Maps, filtra empresas **sem site**, remove duplicados, guarda os leads e o status de contato, exporta CSV. |
| **Web (dashboard)** | [`web/`](web/) | Painel responsivo (roda no computador e no navegador do celular) para buscar, filtrar e gerenciar os leads. |
| **App mobile nativo** | [`mobile/`](mobile/) | App React Native (Expo) instalável no Android/iOS, consumindo a mesma API. |

A fonte de dados é o scraper open‑source
[`gosom/google-maps-scraper`](https://github.com/gosom/google-maps-scraper)
(mesmo motor do kit `google-maps-scraper-kit`), rodando localmente via Docker.

> **Colocar no ar (Vercel + host do backend):** veja [`DEPLOY.md`](DEPLOY.md).
> Resumo: o **painel** vai para o Vercel e o **backend + scraper** vão para um
> host com Docker (VPS ou Railway) — o Vercel sozinho não roda o scraper.

---

## Como a prospecção funciona

1. Você busca algo como **"restaurantes em Campinas"** ou **"salão de beleza São Paulo"**.
2. O backend dispara o scraper do Google Maps e coleta os resultados reais
   (nome, telefone, endereço, categoria, nota, e **se tem site ou não**).
3. O sistema **marca como lead quente toda empresa cujo campo `site` está vazio** —
   são exatamente as empresas que você pode abordar para vender site/marketing.
4. Você acompanha cada lead (a contatar → contatado → fechado), abre o WhatsApp
   com um toque e exporta tudo em CSV quando quiser.

---

## Início rápido (3 passos)

Pré‑requisitos: **Docker** + **Node.js 18+**. Para o app mobile: **Expo** (`npx expo`).

### 1. Suba o scraper + backend com Docker

```bash
cp .env.example .env         # ajuste se quiser
docker compose up -d         # sobe o scraper (porta 8080) e o backend (porta 4000)
```

O backend fica em `http://localhost:4000` e o painel de saúde em
`http://localhost:4000/api/health`.

> Prefere rodar o backend fora do Docker? Veja [`backend/README.md`](backend/README.md).

### 2. Abra o painel web

```bash
cd web
npm install
npm run dev        # abre em http://localhost:5173
```

O painel já vem responsivo — abra no navegador do celular apontando para o IP
da sua máquina (ex.: `http://192.168.0.10:5173`).

### 3. Rode o app mobile nativo (opcional)

```bash
cd mobile
npm install
npm start          # abra no app "Expo Go" lendo o QR code
```

Configure o endereço da API em `mobile/src/config.js` (o IP da máquina onde o
backend está rodando).

---

## Arquitetura

```
       ┌──────────────┐        ┌───────────────────────────┐
       │   Web app    │        │   App mobile (Expo/RN)    │
       │  (dashboard) │        │                           │
       └──────┬───────┘        └─────────────┬─────────────┘
              │  HTTP/JSON                    │  HTTP/JSON
              └───────────────┬───────────────┘
                              ▼
                   ┌────────────────────┐
                   │   Backend / API    │  Node.js + Express
                   │  - dispara buscas  │  + SQLite (leads.db)
                   │  - filtra sem site │
                   │  - guarda leads    │
                   └─────────┬──────────┘
                             │  REST (/api/v1/jobs)
                             ▼
                   ┌────────────────────┐
                   │ google-maps-scraper│  (Docker, porta 8080)
                   │   dados reais do   │
                   │    Google Maps     │
                   └────────────────────┘
```

---

## Aviso legal

O scraper do Google Maps é uma ferramenta de terceiros e coletar dados do Google
Maps **pode violar os Termos de Uso do Google**. Use por sua conta e risco,
respeite os limites de taxa (rate limit) já embutidos e as leis de proteção de
dados (LGPD/GDPR) ao contatar as empresas. Para um sistema de produção mais
robusto e sem risco jurídico, o backend foi desenhado para também aceitar a
**Google Places API** oficial no futuro (veja `backend/src/sources/`).
