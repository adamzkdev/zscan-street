# zsa-svc (ZStreet ZSA Lab backend). Build from the server/ folder, because Cargo.toml
# patches orchard and pasta_curves from ../vendor:
#   docker build -f zsa-engine/Dockerfile -t zsa-svc .
# Only the sources are copied in: never .secrets/, target/ or zsa-data/.

FROM rust:1-bookworm AS build
WORKDIR /src
COPY vendor/pasta_curves vendor/pasta_curves
COPY vendor/orchard-zsa vendor/orchard-zsa
COPY zsa-engine/Cargo.toml zsa-engine/Cargo.lock zsa-engine/
COPY zsa-engine/.cargo zsa-engine/.cargo
COPY zsa-engine/src zsa-engine/src
WORKDIR /src/zsa-engine
# The ZSA code in the forks sits behind cfg(zcash_unstable = "nu7") (also set in .cargo/config.toml).
ENV RUSTFLAGS='--cfg zcash_unstable="nu7"'
RUN cargo build --release --locked --features svc --bin zsa-svc \
 && strip target/release/zsa-svc

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -r -u 10001 -m zsa && mkdir -p /data && chown zsa /data
COPY --from=build /src/zsa-engine/target/release/zsa-svc /usr/local/bin/zsa-svc
USER zsa
ENV ZSA_ADDR=0.0.0.0:8095 \
    ZSA_DATA_DIR=/data \
    ZSA_SEED_FILE=/run/secrets/zsa-sponsor.seed \
    MALLOC_ARENA_MAX=2
VOLUME /data
EXPOSE 8095
CMD ["zsa-svc"]
