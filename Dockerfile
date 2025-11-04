# minimal Node 20 image for NestJS
FROM node:20-alpine
WORKDIR /usr/src/app
COPY package*.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile --production
COPY . .
RUN pnpm build
EXPOSE 3000
CMD [\"node\", \"dist/main.js\"]
