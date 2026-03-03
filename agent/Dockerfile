# =============================================================================
# Stage 1: Build
# =============================================================================
FROM rust:1.75-slim-bookworm AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./

RUN mkdir src && echo "fn main() {}" > src/main.rs

RUN cargo build --release && rm -rf src

COPY src ./src

RUN cargo build --release && \
    cp target/release/shannon-agent /app/shannon-agent

RUN strip -s /app/shannon-agent

# =============================================================================
# Stage 2: Runtime (Distroless)
# =============================================================================
FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app

COPY --from=builder --chown=nonroot:nonroot /app/shannon-agent .

ENV S3_BUCKET=logless-logs
ENV AWS_REGION=auto
ENV FLUSH_INTERVAL_SECS=300
ENV BATCH_SIZE=1000

USER nonroot

ENTRYPOINT ["/app/shannon-agent"]
