ARG arch
FROM --platform=linux/${arch} golang:1.24-bookworm

RUN apt-get update && apt-get install -y libwebkit2gtk-4.1-dev librsvg2-dev file
RUN go install -v github.com/wailsapp/wails/v3/cmd/wails3@latest

# Setup Nodejs
ENV NVM_DIR /usr/local/nvm
ENV NODE_VERSION 22
RUN mkdir /usr/local/nvm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash \
    && . $NVM_DIR/nvm.sh \
    && nvm install $NODE_VERSION \
    && nvm use $NODE_VERSION

ENV NODE_PATH $NVM_DIR/v$NODE_VERSION/lib/node_modules
ENV PATH      $NVM_DIR/v$NODE_VERSION/bin:$PATH

WORKDIR /opt/kanmail

# Finally, copy in the Kanmail tree
COPY . /opt/kanmail
RUN ./build/linux/download-linuxdeploy.sh
