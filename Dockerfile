FROM node:18-alpine
WORKDIR /usr/src/app

ARG NODE_ENV=development
ENV NODE_ENV=${NODE_ENV}
ENV CHOKIDAR_USEPOLLING=true

COPY package*.json ./
RUN npm ci

RUN npm install -g nodemon

COPY . .

EXPOSE 3000

ARG APP_COMMAND=dev
ENV APP_COMMAND=${APP_COMMAND}

CMD ["sh","-c","npm run ${APP_COMMAND}"]
