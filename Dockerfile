FROM mcr.microsoft.com/devcontainers/typescript-node:24

ARG TARGETARCH

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:/root/.cargo/bin:${PATH}"
ENV RUSTUP_TOOLCHAIN=1.96.0
ENV WASM_PACK_VERSION=0.15.0
ENV PUPPETEER_SKIP_DOWNLOAD=true

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		bash \
		build-essential \
		ca-certificates \
		curl \
		git \
		libssl-dev \
		pkg-config \
		python3 \
	&& rm -rf /var/lib/apt/lists/*

RUN corepack enable \
	&& corepack prepare pnpm@11.3.0 --activate \
	&& pnpm config set store-dir /pnpm/store

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- \
		-y \
		--profile minimal \
		--default-toolchain none \
	&& rustup toolchain install "${RUSTUP_TOOLCHAIN}" --profile minimal \
	&& rustup target add wasm32-unknown-unknown --toolchain "${RUSTUP_TOOLCHAIN}"

RUN case "${TARGETARCH}" in \
		amd64) wasm_pack_arch="x86_64" ;; \
		arm64) wasm_pack_arch="aarch64" ;; \
		*) echo "Unsupported Docker architecture: ${TARGETARCH}" >&2; exit 1 ;; \
	esac \
	&& curl -fsSL \
		"https://github.com/rustwasm/wasm-pack/releases/download/v${WASM_PACK_VERSION}/wasm-pack-v${WASM_PACK_VERSION}-${wasm_pack_arch}-unknown-linux-musl.tar.gz" \
		-o /tmp/wasm-pack.tar.gz \
	&& tar -xzf /tmp/wasm-pack.tar.gz -C /tmp \
	&& install -m 0755 "/tmp/wasm-pack-v${WASM_PACK_VERSION}-${wasm_pack_arch}-unknown-linux-musl/wasm-pack" /usr/local/bin/wasm-pack \
	&& rm -rf /tmp/wasm-pack*

WORKDIR /workspace

CMD ["bash"]
