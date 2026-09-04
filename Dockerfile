FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# drizzle-kit + schéma + nomenclature, pour pousser et seeder au démarrage
COPY --from=deps /app/node_modules ./node_modules_full
COPY drizzle.config.ts tsconfig.json ./
COPY src/db ./src/db
# la nomenclature et ses contrôles sont lus par le seeder
COPY src/lib/nomenclature ./src/lib/nomenclature
COPY src/lib/parsers.ts ./src/lib/parsers.ts
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
