FROM --platform=linux/amd64 python:3.9.12-alpine3.15

LABEL maintainer="Nick Barrett, Oxygem <hello@oxygem.com>"

ARG PACKAGES='gcc make git musl-dev libc-dev libffi-dev libressl-dev zlib-dev cargo'

ADD pyproject.toml poetry.lock /opt/kanmail/
WORKDIR /opt/kanmail

RUN apk add --no-cache $PACKAGES \
 && pip install --no-cache-dir poetry \
 && poetry export > requirements.txt \
 && pip install --no-cache-dir -r requirements.txt \
 && apk del --purge $PACKAGES

ADD . /opt/kanmail
ADD ./dist /opt/kanmail/kanmail/client/static/dist

RUN adduser --disabled-password --gecos '' kanmail

RUN chown -R kanmail:kanmail /opt/kanmail

RUN mkdir -p /home/kanmail/.config/kanmail \
 && chown -R kanmail:kanmail /home/kanmail

VOLUME /home/kanmail/.config/kanmail

USER kanmail

ENTRYPOINT [ "/opt/kanmail/scripts/run_server.py" ]
