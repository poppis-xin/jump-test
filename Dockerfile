FROM node:16-alpine

WORKDIR /opt/application

COPY server.js package.json run.sh ./

RUN chmod -R 777 /opt/application

EXPOSE 8000

CMD ["sh", "/opt/application/run.sh"]
