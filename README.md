# Sem Site — prospecção de comércios sem site (OpenStreetMap)

App web (visual **Apple Design**) que mostra no mapa os **comércios de uma cidade
ou bairro que ainda não têm site** — seus leads mais quentes para vender site,
tráfego e presença digital. Usa dados abertos e **gratuitos** do OpenStreetMap.

**Não precisa de nenhuma chave de API.** Roda **100% no Vercel** como site
estático — sem servidor, sem token, sem custo.

![stack](https://img.shields.io/badge/dados-OpenStreetMap-7EBC6F)
![deploy](https://img.shields.io/badge/deploy-Vercel-000?logo=vercel)

---

## Como funciona

1. Você digita uma **cidade ou bairro** (ex.: "Copacabana, Rio de Janeiro") e escolhe o **raio**.
2. O app usa o **Nominatim** (OSM) para achar as coordenadas e a **Overpass API**
   (OSM) para listar os comércios daquela área (lojas, restaurantes, padarias, etc.).
3. Todo comércio **sem a tag `website`** no OpenStreetMap vira um ponto **verde** no
   mapa e um cartão marcado **SEM SITE** na lista — é quem você quer abordar.
4. Um toque abre **WhatsApp**, **liga**, ou abre no **OpenStreetMap**. Você marca
   cada lead como *contatado* / *fechado* (salvo no seu navegador).

O mapa usa **Leaflet** com tiles do OpenStreetMap (também sem chave).

---

## Fontes de dados (3 em paralelo)

Para máxima confiabilidade, o app consulta **até 3 fontes gratuitas ao mesmo
tempo** e junta os resultados (a que responder, entra):

| Fonte | Chave? | Observação |
|---|---|---|
| **OpenStreetMap / Overpass** | ❌ não | Sempre ligada. Servidores públicos às vezes ficam ocupados. |
| **Geoapify** | 🔑 grátis (sem cartão) | Mesmos dados do OSM, servidor **estável**. Ativa com `VITE_GEOAPIFY_KEY`. |
| **Foursquare** | 🔑 grátis | Base focada em comércios. Ativa com `FOURSQUARE_KEY` (fica no servidor). |

Sem nenhuma chave, funciona só com o OpenStreetMap. Adicionando as chaves grátis
(veja [`.env.example`](.env.example)), as 3 fontes rodam juntas e acaba o
"servidor ocupado". Geocoding por [Nominatim](https://nominatim.org) +
[Photon](https://photon.komoot.io); mapa por [Leaflet](https://leafletjs.com).

---

## Rodar localmente

```bash
npm install
npm run dev      # abre em http://localhost:5173
```

Pronto — como não há chaves, funciona direto.

---

## Deploy no Vercel

1. Faça login em [vercel.com](https://vercel.com) com o GitHub e **importe este repositório**.
2. O Vercel detecta Vite sozinho (build `npm run build`, saída `dist`).
3. **Deploy**. Fim — **nenhuma variável de ambiente é necessária**. O app fica em
   `https://seu-projeto.vercel.app`, funcionando no computador e no celular.

---

## O que dá para cobrir (seja realista)

- **Bairro / cidade:** ✅ funciona muito bem. Aumente o raio para pegar mais área.
- **Estado / país inteiro:** ⚠️ a Overpass responde por *área* e o servidor público
  tem **limite de uso por IP** (rate limit). Não existe "baixar o país todo" num
  clique — mas dá para varrer bairro por bairro / cidade por cidade à vontade.
- **Cobertura dos dados:** depende do OpenStreetMap. Em cidades grandes é ótima; em
  regiões menores pode faltar comércio. Qualquer um pode cadastrar um comércio
  faltante em [openstreetmap.org](https://www.openstreetmap.org) e ele aparece na
  Overpass em algumas horas.

> Se aparecer "servidor ocupado", é o limite temporário da Overpass — espere alguns
> segundos e busque de novo. O app já tenta 3 espelhos diferentes automaticamente.

---

## Estrutura

```
├── src/
│   ├── App.jsx        # interface (Apple Design): mapa Leaflet + painel de leads
│   ├── overpass.js    # OpenStreetMap: geocode (Nominatim) + busca (Overpass) + "sem site"
│   ├── styles.css     # visual Apple (materiais translúcidos, claro/escuro)
│   └── main.jsx
├── index.html
└── vercel.json
```

---

## Aviso

Use os dados com responsabilidade, respeite os limites de uso da Overpass/Nominatim
e a LGPD/GDPR ao contatar as empresas. Dados © colaboradores do OpenStreetMap (ODbL).
