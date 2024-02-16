FROM node:20

ENV PORT=80
ENV NODE_ENV=production

EXPOSE ${PORT}

WORKDIR /app

COPY package.json package-lock.json /app/

RUN npm install

COPY build /app/build/

CMD ["node", "build/src/server.js"]
