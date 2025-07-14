FROM ubuntu:focal

RUN apt-get update && apt-get install -y curl git dos2unix
RUN curl -sL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

WORKDIR /home/app

COPY main.sh script.js package*.json ./

RUN dos2unix main.sh script.js
RUN npm install
RUN chmod +x main.sh script.js

ENTRYPOINT ["/home/app/main.sh"]