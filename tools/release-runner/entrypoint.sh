#!/bin/sh
# SPDX-FileCopyrightText: 2026 Jean
# SPDX-License-Identifier: MIT
set -eu
if [ ! -f .runner ]; then
  token="$(cat /run/secrets/runner-registration)"
  ./config.sh --unattended --url https://github.com/jeancarlos/aerial-tizen \
    --token "$token" --name aerial-release-jeanserver --labels aerial-release-notes \
    --work _work
  unset token
fi
exec ./run.sh
