# LeadMapa — App mobile (Expo / React Native)

App nativo (Android/iOS) que consome a mesma API do backend.

## Rodar

1. Tenha o **backend rodando** (veja a raiz do projeto) e descubra o **IP da sua máquina**
   na rede Wi-Fi (ex.: `192.168.0.10`).
2. Edite [`src/config.js`](src/config.js) e coloque esse IP em `API_BASE`
   (o celular e o PC precisam estar na mesma Wi-Fi).
3. Instale e rode:

```bash
cd mobile
npm install
npm start        # abre o Metro; leia o QR code no app "Expo Go" (Android/iOS)
```

## Gerar APK/instalável

Use o EAS Build da Expo:

```bash
npm install -g eas-cli
eas build -p android --profile preview
```

## Telas

- Busca por termo (ex.: "restaurantes em Campinas") disparando o scraper.
- Cartões dos leads com destaque **SEM SITE**, botões de WhatsApp / Ligar / Maps.
- Toque no status para avançar (novo → contatado → negociando → fechado → descartado).
- Puxe para baixo para atualizar a lista.

> `usesCleartextTraffic`/`NSAllowsArbitraryLoads` estão ligados para permitir
> HTTP no IP local em desenvolvimento. Em produção, use HTTPS na API.
