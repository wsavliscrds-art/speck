# Sem Site — prospecção de comércios sem site (Apple Maps)

App web (com visual **Apple Design**) que mostra no mapa os **comércios de uma
cidade ou bairro que ainda não têm site** — seus leads mais quentes para vender
site, tráfego e presença digital. Usa dados reais do **Apple Maps (MapKit JS)**,
em tempo real, sem importar planilhas.

Roda **100% no Vercel**: site estático (React/Vite) + **uma função serverless**
que assina o token do Apple Maps. Sem Docker, sem servidor para manter.

![stack](https://img.shields.io/badge/Apple%20Maps-MapKit%20JS-000?logo=apple)
![deploy](https://img.shields.io/badge/deploy-Vercel-000?logo=vercel)

---

## Como funciona

1. Você digita uma **cidade ou bairro** (ex.: "Moema, São Paulo").
2. O app usa o **Apple Maps** para achar os comércios daquela região (por categoria:
   restaurantes, lojas, padarias, etc.).
3. Todo comércio cujo campo de **site vem vazio** é destacado com ★ verde no mapa e
   marcado como **SEM SITE** na lista — é quem você quer abordar.
4. Um toque abre **WhatsApp**, **liga**, ou abre no **Apple Maps**. Você marca cada
   lead como *contatado* / *fechado* (fica salvo no seu navegador).

> **Busca simples** traz os principais comércios da região. **Varredura** divide a
> área em uma grade e busca célula por célula, achando muito mais comércios (ótimo
> para cobrir uma cidade inteira).

---

## O que dá para cobrir (seja realista)

- **Bairro / cidade:** ✅ funciona muito bem (use "Varredura" para cobertura ampla).
- **Estado / país inteiro:** ⚠️ a API do Apple Maps devolve resultados por *região*
  e tem limite por busca — não existe "baixar o país inteiro" de uma vez. Dá para
  varrer cidade por cidade, mas não um dump nacional em um clique.

---

## Rodar localmente

```bash
npm install

# Opção A (recomendada) — igual à produção, com a função /api/token:
npm i -g vercel
vercel dev            # precisa das variáveis MAPKIT_* (veja abaixo)

# Opção B — rápido, só o front: cole um token pronto no .env
#   VITE_MAPKIT_TOKEN=...   (veja .env.example)
npm run dev
```

---

## Credenciais do Apple Maps (o que você precisa ter)

Você precisa de uma conta **Apple Developer** (paga, US$99/ano) e de uma chave MapKit JS:

1. Apple Developer → **Certificates, Identifiers & Profiles → Keys → (+)**
2. Marque **MapKit JS**, crie e **baixe o arquivo `AuthKey_XXXXXXXXXX.p8`**
   (só é possível baixar uma vez — guarde bem).
3. Anote o **Key ID** (10 caracteres) e o seu **Team ID** (canto superior direito).

Essas três coisas viram variáveis de ambiente (nunca vão para o código):

| Variável | O que é |
|---|---|
| `MAPKIT_TEAM_ID` | Team ID (10 caracteres) |
| `MAPKIT_KEY_ID` | Key ID da chave MapKit (10 caracteres) |
| `MAPKIT_PRIVATE_KEY` | Conteúdo do arquivo `.p8` (com as linhas BEGIN/END) |
| `MAPKIT_ORIGIN` | *(opcional)* trava o token ao seu domínio Vercel |

A chave privada fica **só na função serverless** (`api/token.js`) — o navegador
nunca a vê.

---

## Deploy no Vercel

1. Faça login em [vercel.com](https://vercel.com) com o GitHub e **importe este repositório**.
2. O Vercel detecta Vite sozinho (build `npm run build`, saída `dist`) e publica a
   função `api/token.js` automaticamente.
3. Em **Settings → Environment Variables**, adicione `MAPKIT_TEAM_ID`,
   `MAPKIT_KEY_ID` e `MAPKIT_PRIVATE_KEY` (e, se quiser, `MAPKIT_ORIGIN` com a URL
   do seu app).
4. **Deploy**. Pronto: seu app fica em `https://seu-projeto.vercel.app`, funcionando
   no computador e no celular.

> **Colar a chave `.p8` no Vercel:** abra o arquivo em um editor de texto e cole o
> conteúdo inteiro no valor de `MAPKIT_PRIVATE_KEY` (o Vercel aceita várias linhas).

---

## Estrutura

```
├── api/
│   └── token.js        # função serverless (Vercel) que assina o token do Apple Maps
├── src/
│   ├── App.jsx         # interface (Apple Design): mapa + painel de leads
│   ├── mapkit.js       # integração MapKit JS: busca por região, varredura, geocode
│   ├── styles.css      # visual Apple (materiais translúcidos, claro/escuro)
│   └── main.jsx
├── index.html
├── vercel.json
└── .env.example
```

---

## Aviso

Use os dados com responsabilidade e respeite a LGPD/GDPR ao contatar as empresas,
além dos Termos de Serviço do Apple Maps / MapKit JS.
