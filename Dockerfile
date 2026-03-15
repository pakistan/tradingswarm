FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
ENV DATABASE_PATH=/app/data/tradingswarm.db
CMD ["npm", "start"]
