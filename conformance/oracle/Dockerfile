# The Oracle image (Story 2.2, FR-6, OQ-9): PHP 8.5.11 and the Upstream
# snapshot, each directory with its locked dev dependencies (PHPUnit, Pest,
# Mockery, Orchestra Testbench), plus Upstream's Linux CI extension set for
# the baseline run.
#
# Build it from the repository root, after `bun run upstream:sync`:
#
#   bun run oracle:build <image>
#
# which runs `docker build --file conformance/oracle/Dockerfile --build-arg
# XARAVEL_ROOT_VERSIONS=<list from the Pin> .` twice and verifies both
# builds (docs/ops/oracle.md). Dockerfile.dockerignore admits only
# conformance/upstream/ and conformance/oracle/locks/ into the context.
#
# Both base images are pinned by digest. The build runs only `composer
# install` from the committed locks, never `composer update`, and the
# snapshot's composer.json files are copied unmodified. A GitHub token, if
# given, reaches Composer only through the `github_token` BuildKit secret
# mount; it is never in an ARG, an ENV or a layer. It is readable only in the
# download pass, which runs `composer install --no-plugins --no-scripts` and so
# no package code; the pass that runs Composer plugins and scripts has no
# token (`oracle:check` enforces the split).

FROM composer:2.10.3@sha256:af98f42dfff7c68ba8d53c2164fd9fde1087b7d449514baa38c418b1f6bc4bac AS composer

FROM php:8.5.11-cli-trixie@sha256:01a109229f4465bc9ef042d9198f09a4d9da7775a825dbd8572dcdbd8756c4d3

# Links the GHCR package to the repository on its first push.
LABEL org.opencontainers.image.source="https://github.com/xaravel/framework" \
      org.opencontainers.image.licenses="MIT"

# The locks need gmp (laravel/framework's require-dev) and ftp
# (league/flysystem-ftp) beyond the official image's extensions; unzip and git
# let Composer unpack and, as a fallback, clone packages. The baseline run
# (Story 2.6, docs/ops/baseline.md) needs Upstream's Linux CI extension set
# (conformance/upstream/framework/.github/workflows/tests.yml), so no test
# records an image-caused skip: pdo_mysql, pdo_pgsql, intl, zip, pcntl and gd
# (freetype, jpeg, webp), plus the PECL extensions igbinary, msgpack,
# memcached, imagick and redis, at pinned versions. Each PECL source is
# downloaded from pecl.php.net and checked against its pinned sha256 before it
# is built; igbinary and msgpack are built first, and redis is configured as
# Upstream's CI configures it (igbinary, msgpack, lzf, zstd, lz4). The build
# fails unless `php -m` lists every extension.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends git unzip curl ca-certificates pkg-config \
        libgmp-dev libpq-dev libicu-dev libzip-dev libfreetype-dev libjpeg62-turbo-dev libpng-dev libwebp-dev \
        libmemcached-dev zlib1g-dev libmagickwand-dev liblz4-dev liblzf-dev libzstd-dev; \
    docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp; \
    docker-php-ext-install -j"$(nproc)" gmp pdo_mysql pdo_pgsql intl zip pcntl gd; \
    if ! php -m | grep -qix ftp; then docker-php-ext-install -j"$(nproc)" ftp; fi; \
    pecl_build() { \
        name="$1"; version="$2"; sha="$3"; shift 3; \
        mkdir -p /tmp/pecl; \
        curl -fsSL -o "/tmp/pecl/$name.tgz" "https://pecl.php.net/get/$name-$version.tgz"; \
        echo "$sha  /tmp/pecl/$name.tgz" | sha256sum -c -; \
        mkdir "/tmp/pecl/$name"; \
        tar -xzf "/tmp/pecl/$name.tgz" -C "/tmp/pecl/$name" --strip-components=1; \
        cd "/tmp/pecl/$name"; \
        phpize; \
        ./configure "$@"; \
        make -j"$(nproc)"; \
        make install; \
        cd /; \
        docker-php-ext-enable "$name"; \
    }; \
    pecl_build igbinary 3.2.17RC1 91da821443db125282a6aea039f24588dd28ff5d71e8187f6ecc41165bceafbc; \
    pecl_build msgpack 3.0.1 e30be355ab79aaea4568692fbd6073fd7c7f50ea8d3cf12edce40fc0c921d868; \
    pecl_build redis 6.3.0 0d5141f634bd1db6c1ddcda053d25ecf2c4fc1c395430d534fd3f8d51dd7f0b5 \
        --enable-redis --enable-redis-igbinary --enable-redis-msgpack --enable-redis-lzf --with-liblzf --enable-redis-zstd --with-libzstd --enable-redis-lz4 --with-liblz4; \
    pecl_build memcached 3.4.0 c163434eb0da97c8f45c7ad41d979d381f8b81c49402b1b90b063987fb37972e; \
    pecl_build imagick 3.8.1 3a3587c0a524c17d0dad9673a160b90cd776e836838474e173b549ed864352ee; \
    for ext in gmp ftp pdo_mysql pdo_pgsql intl zip pcntl gd igbinary msgpack redis memcached imagick; do \
        php -m | grep -qix "$ext"; \
    done; \
    rm -rf /var/lib/apt/lists/* /tmp/pecl /tmp/pear

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

# XARAVEL_ROOT_VERSIONS is `<name>:<Pin tag without the v>` for each
# snapshot, in pin order. `oracle:build` derives it from
# conformance/baseline-pin and passes it with --build-arg, and the image tag
# hashes it, so a Pin move needs no edit here; the build fails when it is
# unset or empty. COMPOSER_ROOT_VERSION is each snapshot's Pin tag without the
# `v`, as when the lock was resolved.
#
# The install runs in two passes. The download pass mounts the token and runs
# `composer install --no-plugins --no-scripts`: it only downloads and extracts
# the locked packages, so no plugin or script code runs while the token file
# and COMPOSER_AUTH exist, and both exist only during this RUN. It removes the
# Composer home and cache it filled, so they never reach its layer, and it
# creates the `oracle` user and hands it /oracle/upstream here, in the layer
# that wrote vendor/, so no later layer copies every vendor file up again.
ARG XARAVEL_ROOT_VERSIONS
RUN --mount=type=secret,id=github_token \
    set -eu; \
    : "${XARAVEL_ROOT_VERSIONS:?pass --build-arg XARAVEL_ROOT_VERSIONS (bun run oracle:build does)}"; \
    if [ -s /run/secrets/github_token ]; then \
        COMPOSER_AUTH="{\"github-oauth\":{\"github.com\":\"$(cat /run/secrets/github_token)\"}}"; \
        export COMPOSER_AUTH; \
    fi; \
    for pair in $XARAVEL_ROOT_VERSIONS; do \
        name="${pair%%:*}"; \
        cd "/oracle/upstream/$name"; \
        COMPOSER_ROOT_VERSION="${pair#*:}" composer install --no-progress --prefer-dist --no-plugins --no-scripts; \
    done; \
    rm -rf /tmp/composer-home /tmp/composer-cache; \
    groupadd --gid 1001 oracle; \
    useradd --uid 1001 --gid 1001 --create-home --shell /bin/sh oracle; \
    chown -R 1001:1001 /oracle/upstream; \
    chmod -R u+w /oracle/upstream

# The token-less pass mounts no secret and sets no COMPOSER_AUTH. It runs the
# same `composer install` with the original flags over the populated vendor/:
# nothing is downloaded, the installed plugins activate (pestphp/pest-plugin
# writes vendor/pest-plugins.json), the autoloader is regenerated and the root
# `post-autoload-dump` scripts run, as in a single-pass install. It removes the
# Composer home and cache it wrote again, and gives the `oracle` user only the
# files it wrote or left unwritable (a recursive chown or chmod would copy
# every unchanged vendor file into this layer).
RUN set -eu; \
    for pair in $XARAVEL_ROOT_VERSIONS; do \
        name="${pair%%:*}"; \
        cd "/oracle/upstream/$name"; \
        COMPOSER_ROOT_VERSION="${pair#*:}" composer install --no-progress --prefer-dist; \
    done; \
    rm -rf /tmp/composer-home /tmp/composer-cache; \
    find /oracle/upstream ! -user 1001 -exec chown 1001:1001 {} +; \
    find /oracle/upstream ! -perm -u+w -exec chmod u+w {} +

# Upstream's tests run as uid 1001, the GitHub runner's user, never as root
# (docs/ops/baseline.md): tests that chmod a file and expect access to be
# denied pass only for a non-root user. Root is used only for the build steps
# above. /oracle/upstream, where the tests write, belongs to that user and is
# writable by it, as a CI checkout is (the snapshot is copied read-only).
USER 1001:1001
WORKDIR /oracle/upstream
CMD ["php", "--version"]
