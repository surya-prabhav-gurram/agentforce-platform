FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
COPY prisma ./prisma

RUN npx prisma generate
RUN npm run build
RUN cp -r src/graphql/schema dist/graphql/schema

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/index.js"]
