FROM node:22-bookworm

WORKDIR /app

RUN echo 'deb http://deb.debian.org/debian bookworm-backports main' > /etc/apt/sources.list.d/backports.list
RUN apt-get update
RUN apt-get install -y ffmpeg ghostscript libreoffice coreutils imagemagick
# bookworm ships libheif 1.15, which refuses the HEIC files iPhones produce
RUN apt-get install -y -t bookworm-backports libheif1

COPY package.json .
COPY package-lock.json .
RUN npm ci

COPY . .

RUN npm run build

CMD ["npm", "start"]