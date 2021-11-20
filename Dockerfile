ARG IMAGE_VERSION=14.11
FROM mhart/alpine-node:${IMAGE_VERSION}

RUN apk update && \
    apk upgrade && \
    apk add git
    
# Create app directory
RUN mkdir -p /app
WORKDIR /app

# Install app dependencies (as re-usable layer)
COPY app/package.json /app/
RUN npm install

# Bundle app source
COPY app/ /app

# Create application user 
RUN addgroup -g 1001 mon && \
    adduser -u 1001 -G mon -h /app -s /bin/sh -D mon && \
    chown -R mon:mon /app

USER mon:mon 

VOLUME /app/config

CMD node app.js
