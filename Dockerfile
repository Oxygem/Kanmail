FROM node:lts-alpine as javascript

WORKDIR /app
COPY . .
RUN npm install
RUN npm run build

FROM python:3.6-alpine as prod

LABEL maintainer="Nick Barrett, Oxygem <hello@oxygem.com>"

ARG PACKAGES='gcc make git musl-dev libc-dev libffi-dev libressl-dev cargo'

ADD ./requirements /opt/kanmail/requirements

RUN apk add --no-cache $PACKAGES \
 && pip install -r /opt/kanmail/requirements/docker.txt --no-cache-dir \
 && apk del --purge $PACKAGES

ADD . /opt/kanmail
COPY --from=javascript /app/dist /opt/kanmail/kanmail/client/static/dist

RUN adduser --disabled-password --gecos '' kanmail

WORKDIR /opt/kanmail

RUN chown -R kanmail:kanmail /opt/kanmail

USER kanmail

ENTRYPOINT [ "/opt/kanmail/scripts/run_server.py" ]
