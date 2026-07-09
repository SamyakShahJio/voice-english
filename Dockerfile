# Portable container image — works on Fly.io, Railway, Cloud Run, any host.
# Keys are provided at runtime as env vars, never baked into the image.
FROM node:20-slim
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 8795
CMD ["npm", "start"]
