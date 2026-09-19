FROM node:20-bookworm-slim

# better-sqlite3 precisa de ferramentas de build caso não haja binário pré-compilado
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=4000
EXPOSE 4000

CMD ["node", "src/index.js"]
