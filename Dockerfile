FROM python:3.6-alpine

LABEL maintainer="Nick Barrett <pointlessrambler@gmail.com>"

ARG PACKAGES='gcc make git musl-dev libc-dev libffi-dev libressl-dev'

ADD ./requirements /opt/kanmail/requirements

RUN apk add --no-cache $PACKAGES \
 && pip install -r /opt/kanmail/requirements/base.txt --no-cache-dir \
 && apk del --purge $PACKAGES

ADD . /opt/kanmail
ADD ./dist /opt/kanmail/kanmail/client/static/dist

RUN adduser --disabled-password --gecos '' kanmail

WORKDIR /opt/kanmail

RUN chown -R kanmail:kanmail /opt/kanmail

USER kanmail

ENTRYPOINT [ "/opt/kanmail/scripts/run_server.py" ] 
