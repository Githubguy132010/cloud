FROM node:22-slim

# Install gws CLI (Google Workspace CLI)
# https://github.com/googleworkspace/cli
RUN npm install -g @googleworkspace/cli

WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY setup.mjs ./

EXPOSE 8080

ENTRYPOINT ["node", "setup.mjs"]
