# Deploy do LeadMapa

O sistema tem duas metades que vão para lugares diferentes:

```
   PAINEL (web/)                    BACKEND + SCRAPER (backend/ + docker)
   ─────────────                    ────────────────────────────────────
   Site estático React              API Node + SQLite + scraper (Docker)
   → Vercel  ✅ fácil               → precisa de host com Docker
                                       (VPS, Railway, Render, Fly.io)
        │                                        ▲
        └──────── VITE_API_BASE ─────────────────┘
              (URL pública do backend)
```

> **Por que o backend não vai no Vercel?** O Vercel é serverless: funções curtas
> (segundos) e disco que some a cada requisição. O scraper roda em Docker e as
> buscas levam **minutos** — isso não cabe no modelo do Vercel. Por isso o
> backend + scraper vão para um host com Docker.

---

## Parte 1 — Painel no Vercel (5 minutos)

1. Faça login em [vercel.com](https://vercel.com) com o GitHub.
2. **Add New → Project** e importe o repositório `wsavliscrds-art/speck`.
3. Configure:
   - **Root Directory:** `web`
   - **Framework Preset:** Vite (detecta sozinho)
   - **Build Command:** `npm run build` · **Output:** `dist`
4. Em **Environment Variables**, adicione:
   - `VITE_API_BASE` = a URL pública do seu backend (ex.: `https://leadmapa-api.up.railway.app`)
     — você terá essa URL depois da Parte 2. Pode subir sem ela e adicionar depois (basta um **Redeploy**).
5. **Deploy**. Pronto: seu painel fica em `https://seu-projeto.vercel.app` e
   funciona no computador e no navegador do celular.

> O painel do Vercel serve os dados do backend que você configurar em `VITE_API_BASE`.
> Sem essa variável, o painel sobe mas não acha a API.

---

## Parte 2 — Backend + Scraper (escolha um host)

Os dois sobem juntos com o `docker-compose.yml` que já está no repositório.

### Opção A — VPS próprio (mais confiável e barato)

Serve qualquer servidor com Docker (Hetzner, DigitalOcean, Contabo, etc.):

```bash
git clone https://github.com/wsavliscrds-art/speck.git
cd speck
cp .env.example .env         # ajuste CORS_ORIGIN para a URL do seu Vercel
docker compose up -d         # sobe scraper (8080) + backend (4000)
```

Depois coloque **HTTPS** na frente (o Vercel exige HTTPS para chamar a API).
O jeito mais simples é o [Caddy](https://caddyserver.com), que gera o certificado
sozinho. Crie um `Caddyfile`:

```
api.seudominio.com.br {
    reverse_proxy localhost:4000
}
```

e rode `caddy run`. Sua API fica em `https://api.seudominio.com.br` → use isso
no `VITE_API_BASE` do Vercel.

### Opção B — Railway (gerenciado, sem servidor)

1. Em [railway.app](https://railway.app): **New Project → Deploy from GitHub** → `speck`.
2. Crie **dois serviços**:
   - **scraper**: imagem `gosom/google-maps-scraper`, comando
     `-data-folder /gmapsdata -web -addr 0.0.0.0:8080`, porta `8080`.
   - **backend**: build a partir de `backend/` (usa o `backend/Dockerfile`),
     porta `4000`.
3. No serviço **backend**, defina as variáveis:
   - `SCRAPER_BASE_URL` = URL **privada** do serviço scraper (ex.: `http://scraper.railway.internal:8080`)
   - `CORS_ORIGIN` = a URL do seu Vercel
   - `DB_PATH` = `/data/leads.db` e conecte um **Volume** montado em `/data`
     (para os leads não sumirem a cada deploy).
4. Gere um domínio público para o **backend** e use no `VITE_API_BASE` do Vercel.

> **Importante (SQLite):** para os leads persistirem, o backend precisa de um
> **disco/volume** montado onde fica o `.db`. Em planos sem disco, os dados
> zeram a cada redeploy. Se quiser algo sem essa preocupação, dá para trocar o
> SQLite por Postgres (Neon/Supabase) — posso adaptar quando você decidir o host.

---

## Checklist final

- [ ] Backend + scraper no ar, respondendo em `https://.../api/health` com `"scraper": true`
- [ ] `CORS_ORIGIN` do backend = URL do Vercel
- [ ] `VITE_API_BASE` do Vercel = URL pública do backend (com **https**)
- [ ] Redeploy do Vercel após configurar a variável
- [ ] Abrir o painel, buscar "restaurantes em Campinas" e ver os leads chegando

---

## Resumo em uma frase

**Painel → Vercel.** **Backend + scraper → um host com Docker** (VPS ou Railway).
O Vercel sozinho não roda o scraper; ele é só a vitrine que conversa com a API.
