# PGM backend — zero-dependency Node http server (serves static + API + SSE).
FROM node:22-alpine
WORKDIR /app
# No npm install needed: the server uses only Node built-ins.
COPY backend/src ./backend/src
COPY public ./public
ENV PORT=3000
EXPOSE 3000
CMD ["node", "backend/src/server.js"]
