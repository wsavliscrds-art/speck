# LeadMapa — Backend / API

API em Node.js + Express que orquestra o scraper do Google Maps, filtra empresas
**sem site**, deduplica e guarda os leads em SQLite.

## Rodar local (sem Docker)

Você precisa do scraper `google-maps-scraper` rodando em `http://localhost:8080`:

```bash
docker run -p 8080:8080 -v "$PWD/gmapsdata:/gmapsdata" \
  gosom/google-maps-scraper -web -addr 0.0.0.0:8080 -data-folder /gmapsdata
```

Depois:

```bash
cd backend
cp ../.env.example .env      # ajuste SCRAPER_BASE_URL=http://localhost:8080
npm install
npm run dev                  # http://localhost:4000
```

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Status da API e se o scraper responde |
| POST | `/api/search` | Dispara uma busca. Body: `{ "query": "restaurantes em Campinas" }`. Retorna um job. |
| GET | `/api/jobs` | Lista os jobs de busca |
| GET | `/api/jobs/:id` | Status de um job (`na_fila` → `rodando` → `concluido`/`erro`) |
| GET | `/api/leads` | Lista leads. Filtros: `onlyWithoutSite=1`, `status`, `q`, `minRating` |
| GET | `/api/leads/export.csv` | Exporta os leads filtrados em CSV |
| GET | `/api/leads/:id` | Detalhe de um lead |
| PATCH | `/api/leads/:id` | Atualiza `status`, `notes`, `phone`, `website`, `email` |
| DELETE | `/api/leads/:id` | Remove um lead |
| GET | `/api/stats` | Totais para o painel |

### Exemplo

```bash
# dispara uma busca
curl -X POST http://localhost:4000/api/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"salão de beleza em São Paulo"}'

# acompanha (troque o ID)
curl http://localhost:4000/api/jobs/<id>

# lista só quem NÃO tem site
curl 'http://localhost:4000/api/leads?onlyWithoutSite=1'
```

## Status de contato dos leads

`novo` → `contatado` → `negociando` → `fechado` / `descartado`

O front usa exatamente esses valores no campo `status`.

## Fonte de dados alternativa (futuro)

O módulo `src/scraper.js` isola o acesso ao scraper. Para trocar pela **Google
Places API** oficial, basta criar um `src/sources/places.js` com a mesma
assinatura de `runSearch(query, opts)` e apontar o `index.js` para ele.
