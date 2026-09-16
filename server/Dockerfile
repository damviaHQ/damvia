FROM node:22-bookworm

WORKDIR /app

RUN apt-get update
RUN apt-get install -y ffmpeg ghostscript libreoffice coreutils imagemagick

COPY package.json .
COPY package-lock.json .
RUN npm ci

COPY . .

RUN npm run build

CMD ["npm", "start"]