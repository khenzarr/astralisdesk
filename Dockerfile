FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
RUN mkdir -p /app/data/community && chown -R node:node /app
USER node
ENV NODE_ENV=production PORT=8443 ASTRALIS_DATA_DIR=/app/data/community
EXPOSE 8443
CMD ["node", "src/community-server.js"]
