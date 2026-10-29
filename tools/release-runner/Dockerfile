# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git gh libicu72 libkrb5-3 libssl3 zlib1g && rm -rf /var/lib/apt/lists/*

USER node
WORKDIR /home/node/actions-runner
RUN curl -fsSL -o runner.tar.gz https://github.com/actions/runner/releases/download/v2.338.0/actions-runner-linux-x64-2.338.0.tar.gz \
    && echo 'af4b794c1bc41d73d40535e3fe092a39f9679cd8d965954c2aca25a05ca41d32  runner.tar.gz' | sha256sum -c - \
    && tar -xzf runner.tar.gz && rm runner.tar.gz
COPY --chown=node:node entrypoint.sh /home/node/entrypoint.sh
ENTRYPOINT ["/bin/sh", "/home/node/entrypoint.sh"]
