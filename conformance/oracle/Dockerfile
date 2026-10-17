# The Oracle image (Story 2.2, FR-6, OQ-9): PHP 8.5.11 and the Upstream
# snapshot, each directory with its locked dev dependencies (PHPUnit, Pest,
# Mockery, Orchestra Testbench), plus pdo_pgsql and phpredis for the baseline
# run.
#
# Build it from the repository root, after `bun run upstream:sync`:
#
#   bun run oracle:build <image>
#
# which runs `docker build --file conformance/oracle/Dockerfile .` twice and
# verifies both builds (docs/ops/oracle.md). Dockerfile.dockerignore admits
# only conformance/upstream/ and conformance/oracle/locks/ into the context.
#
# Both base images are pinned by digest. The build runs only `composer
# install` from the committed locks, never `composer update`, and the
# snapshot's composer.json files are copied unmodified. A GitHub token, if
# given, reaches Composer only through the `github_token` BuildKit secret
# mount; it is never in an ARG, an ENV or a layer.

FROM composer:2.10.3@sha256:af98f42dfff7c68ba8d53c2164fd9fde1087b7d449514baa38c418b1f6bc4bac AS composer

FROM php:8.5.11-cli-trixie@sha256:01a109229f4465bc9ef042d9198f09a4d9da7775a825dbd8572dcdbd8756c4d3

# Links the GHCR package to the repository on its first push.
LABEL org.opencontainers.image.source="https://github.com/xaravel/framework" \
      org.opencontainers.image.licenses="MIT"

# The locks need gmp (laravel/framework's require-dev) and ftp
# (league/flysystem-ftp) beyond the official image's extensions; unzip and git
# let Composer unpack and, as a fallback, clone packages. The baseline run
# (Story 2.6, docs/ops/baseline.md) needs pdo_pgsql for the pgsql variant and
# phpredis, pinned, for the redis variants.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends git unzip libgmp-dev libpq-dev; \
    docker-php-ext-install -j"$(nproc)" gmp pdo_pgsql; \
    if ! php -m | grep -qix ftp; then docker-php-ext-install -j"$(nproc)" ftp; fi; \
    pecl install redis-6.3.0; \
    docker-php-ext-enable redis; \
    php -m | grep -qix pdo_pgsql; \
    php -m | grep -qix redis; \
    rm -rf /var/lib/apt/lists/* /tmp/pear

COPY --from=composer /usr/bin/composer /usr/bin/composer

ENV COMPOSER_ALLOW_SUPERUSER=1 \
    COMPOSER_NO_INTERACTION=1 \
    COMPOSER_HOME=/tmp/composer-home \
    COMPOSER_CACHE_DIR=/tmp/composer-cache

COPY conformance/upstream/framework /oracle/upstream/framework
COPY conformance/upstream/ai /oracle/upstream/ai
COPY conformance/upstream/mcp /oracle/upstream/mcp
COPY conformance/upstream/boost /oracle/upstream/boost
COPY conformance/oracle/locks/framework/composer.lock /oracle/upstream/framework/composer.lock
COPY conformance/oracle/locks/ai/composer.lock /oracle/upstream/ai/composer.lock
COPY conformance/oracle/locks/mcp/composer.lock /oracle/upstream/mcp/composer.lock
COPY conformance/oracle/locks/boost/composer.lock /oracle/upstream/boost/composer.lock

# COMPOSER_ROOT_VERSION is each snapshot's Pin tag without the `v`, as when
# the lock was resolved. The token file exists only during this RUN.
RUN --mount=type=secret,id=github_token \
    set -eu; \
    if [ -s /run/secrets/github_token ]; then \
        COMPOSER_AUTH="{\"github-oauth\":{\"github.com\":\"$(cat /run/secrets/github_token)\"}}"; \
        export COMPOSER_AUTH; \
    fi; \
    for pair in framework:13.37.0 ai:1.2.3 mcp:1.0.2 boost:2.10.3; do \
        name="${pair%%:*}"; \
        cd "/oracle/upstream/$name"; \
        COMPOSER_ROOT_VERSION="${pair#*:}" composer install --no-progress --prefer-dist; \
    done; \
    rm -rf /tmp/composer-home /tmp/composer-cache

WORKDIR /oracle/upstream
CMD ["php", "--version"]
