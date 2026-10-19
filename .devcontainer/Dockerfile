# The Xaravel workspace image (Story 5.10; AD-17, AD-28, NFR-1, NFR-7).
#
# The base is CI's Redis image, so `redis-server` on PATH is exactly CI's
# build. Bun is copied from `oven/bun` at `.bun-version`. Every base image is
# multi-arch (linux/amd64 and linux/arm64). `bun run devcontainer:pins`
# checks BUN_VERSION and REDIS_IMAGE against `.bun-version`, CI's service
# images and the spine's Stack table.
#
# The build context is `.devcontainer/` only: no repository file enters the
# image, and no credential or application key is baked into it.
ARG BUN_VERSION=1.4.3
ARG REDIS_IMAGE=redis:8.10.2

FROM oven/bun:${BUN_VERSION} AS bun

FROM ${REDIS_IMAGE}

# The host user's ids, so a bind-mounted checkout stays writable.
ARG XARAVEL_UID=1000
ARG XARAVEL_GID=1000

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -sf /usr/local/bin/bun /usr/local/bin/bunx

# Refuse uid or gid 0 (`useradd --non-unique` would make a second root), and
# reuse the group when the GID already exists in the base image.
RUN set -eu; \
    if [ "${XARAVEL_UID}" = "0" ] || [ "${XARAVEL_GID}" = "0" ]; then \
      echo "XARAVEL_UID and XARAVEL_GID must not be 0: the workspace user is non-root" >&2; exit 1; \
    fi; \
    if ! getent group "${XARAVEL_GID}" > /dev/null; then groupadd --gid "${XARAVEL_GID}" xaravel; fi; \
    useradd --non-unique --uid "${XARAVEL_UID}" --gid "${XARAVEL_GID}" --create-home --shell /bin/bash xaravel; \
    git config --system safe.directory /workspaces/xaravel; \
    mkdir -p /workspaces/xaravel/.cache /workspaces/xaravel/node_modules; \
    chown -R "${XARAVEL_UID}:${XARAVEL_GID}" /workspaces/xaravel

# COPY then chmod: the legacy builder rejects `COPY --chmod`.
COPY start.sh /usr/local/bin/xaravel-start
RUN chmod 0755 /usr/local/bin/xaravel-start

WORKDIR /workspaces/xaravel
ENTRYPOINT []
USER xaravel
CMD ["/usr/local/bin/xaravel-start"]
