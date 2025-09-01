FROM node:18-alpine
WORKDIR /usr/src/app

# 1) Install dependencies (include devDeps; we do NOT set NODE_ENV here)
COPY package*.json ./
RUN npm ci

# 2) ALSO install nodemon globally so it's on PATH regardless of node_modules mount
RUN npm i -g nodemon

# 3) Bring in source
COPY . .

EXPOSE 3000

# Default to prod start; compose will override to dev
CMD ["npm","start"]
