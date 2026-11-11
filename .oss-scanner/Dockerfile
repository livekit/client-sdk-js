# Build image for Anthropic's OSS Scanner. CI pins only Node's major version (setup-node `node-version: 24`).
FROM node:24-bookworm

ENV CI=true

# Match package.json's packageManager exactly: on a mismatch pnpm 10 downloads that version, which fails offline.
RUN npm install -g pnpm@10.34.7 && pnpm --version

WORKDIR /src
COPY . /src

RUN pnpm install --frozen-lockfile
RUN pnpm build

# Unit tests only (happy-dom). The e2e suite needs Chromium and a separately built Go mock server.
RUN pnpm test || echo 'WARNING: baseline tests failed'

ENV npm_config_offline=true

CMD ["bash"]
