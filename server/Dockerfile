FROM node:20

WORKDIR /app

RUN apt-get update
RUN apt-get install -y ffmpeg

COPY package.json .
COPY package-lock.json .
RUN npm install

COPY . .

RUN npm run build

CMD ["npm", "start"]
