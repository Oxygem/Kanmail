FROM python:3.6-alpine

ARG PACKAGES='gcc make git musl-dev libc-dev'

ADD ./requirements /opt/kanmail/requirements

RUN apk add --no-cache $PACKAGES \
 && pip install -r /opt/kanmail/requirements/base.txt --no-cache-dir \
 && apk del --purge $PACKAGES

ADD . /opt/kanmail
ADD ./dist /opt/kanmail/kanmail/client/static/dist

WORKDIR /opt/kanmail
CMD /opt/kanmail/scripts/run_server.py
