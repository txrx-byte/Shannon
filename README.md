# LogLess
Legacy logging platforms charge you to store the noise. This architecture is entirely about identifying the signal at the Edge and dropping the noise before it costs you a dime.

## Zero-ETL Edge Telemetry. Powered by the Shannon Agent.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Rust](https://img.shields.io/badge/Rust-1.75+-orange.svg)](https://www.rust-lang.org)
[![Helm](https://img.shields.io/badge/Helm-3.0+-blue.svg)](https://helm.sh)
[![DuckDB](https://img.shields.io/badge/DuckDB-Wasm-green.svg)](https://duckdb.org)

**Stop paying $600/month per TB for logs you'll never read.** LogLess is a complete observability stack that runs at **97% lower cost** than traditional SaaS platforms by moving compute to the edge and storing data in open, queryable formats.

> 🔑 **Key Advantage:** By pairing DuckDB-Wasm with Cloudflare R2's **Zero Egress Fee** architecture, your browser can query gigabytes of Parquet files directly without costing you a single cent in bandwidth.

| Metric | Datadog/Splunk | LogLess |
|--------|---------------|---------|
| **Storage Cost** | ~$500/TB/mo | **~$15/TB/mo** (R2) |
| **Ingestion Fees** | $0.50–$2.50/GB | **$0** (edge filtering) |
| **Query Compute** | Included (expensive) | **$0** (browser-based) |
| **Egress Fees** | $0.12/GB | **$0** (R2) |
| **Vendor Lock-in** | Proprietary format | **Open Parquet** |
| **Time to Value** | Weeks (contracts) | **60 seconds** (Helm) |

---

## 🚀 Quick Start

### 1. Deploy the Agent (60 seconds)

```bash
# Add the Helm repo
helm repo add logless [WIP]

# Install across your entire Kubernetes cluster
# ⚠️ In production, pass credentials via existing K8s Secrets or IAM/IRSA
helm install logless-agent logless/logless-agent \
  --namespace logless-system --create-namespace \
  --set storage.bucket="my-production-logs" \
  --set storage.accessKeyId="YOUR_R2_ACCESS_KEY" \
  --set storage.secretAccessKey="YOUR_R2_SECRET_KEY" \
  --set storage.endpoint="https://ACCOUNT_ID.r2.cloudflarestorage.com"
```

### 2. Open the Dashboard (0 seconds)

```bash
# The dashboard is a static site - host it anywhere
git clone [WIP]
cd ui
npm install
npm run dev  # Opens at http://localhost:5173
```

**That's it.** Your cluster is now shipping filtered logs to R2, and you can query them instantly from your browser.

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           YOUR KUBERNETES CLUSTER                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Pod A     │  │   Pod B     │  │   Pod C     │  │   Pod D     │        │
│  │  (app logs) │  │  (app logs) │  │  (app logs) │  │  (app logs) │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │                │
│         └────────────────┴────────────────┴────────────────┘                │
│                                  │                                          │
│                          ┌───────▼───────┐                                  │
│                          │ Shannon Agent │  ← Runs as DaemonSet on every   │
│                          │   (Rust)      │     node, tails /var/log/containers│
│                          └───────┬───────┘                                  │
│                                  │                                          │
│                    [Filter: Drop 90% INFO/DEBUG]                            │
│                    [Convert: JSON → Parquet]                                │
│                    [Partition: year=/month=/day=/hour=]                     │
│                                  │                                          │
└──────────────────────────────────┼──────────────────────────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │   Cloudflare R2 Bucket       │  ← $0.015/GB, $0 egress
                    │   (or AWS S3 / MinIO)        │
                    │   data_*.parquet files       │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │   Your Browser               │  ← DuckDB-Wasm queries
                    │   (LogLess UI)               │     directly against R2
                    │   [DuckDB + Recharts]        │     No backend required
                    └──────────────────────────────┘
```

### Why This Works

| Traditional SaaS | LogLess |
|-----------------|---------|
| Send **all** logs to central server | Filter **at the edge**, send only errors |
| Proprietary indexed storage | Open **Parquet** format (queryable by anything) |
| Pay for ingest + storage + query + egress | Pay for **storage only** (pennies) |
| Vendor lock-in | **Own your data** forever |

---

## 📦 Components

### 1. Shannon Edge Agent (`logless-agent`)

A lightweight Rust binary that runs as a Kubernetes DaemonSet:

- **Tails** container logs via `linemux` (handles rotation, glob patterns)
- **Filters** using deterministic rules (drop INFO/DEBUG by default)
- **Converts** to columnar Parquet format (90% compression vs JSON)
- **Uploads** to S3-compatible storage with time-based partitioning
- **Zero dependencies** - runs as a 20MB Distroless container

**Key Features:**
- Async MPSC channels (non-blocking)
- Configurable flush intervals (time OR batch size)
- Automatic file rescan for new pods
- Graceful shutdown with final flush

### 2. Storage Backend (R2 / S3)

Logs are stored as partitioned Parquet files:

```
s3://bucket/
├── year=2026/
│   ├── month=03/
│   │   ├── day=03/
│   │   │   ├── hour=14/
│   │   │   │   └── data_abc123.parquet
│   │   │   └── hour=15/
│   │   │       └── data_def456.parquet
```

**Partition pruning** means queries only scan relevant files. A 15-minute query touches ~0.1% of your total data.

### 3. Browser Dashboard (`logless-ui`)

A static React app powered by DuckDB-Wasm:

- **Zero backend** - queries R2 directly from the browser
- **Instant results** - Parquet + partition pruning = sub-second queries
- **Time-series charts** - Built-in error rate visualization
- **AG-Grid table** - Full-featured log exploration
- **Host anywhere** - Cloudflare Pages, S3, Netlify ($0/mo)

---

## 🔧 Configuration

### Helm Values Reference

| Key | Default | Description |
|-----|---------|-------------|
| `storage.bucket` | `logless-logs` | R2/S3 bucket name |
| `storage.region` | `auto` | `auto` for R2, `us-east-1` for AWS |
| `storage.endpoint` | (empty) | R2 endpoint URL (required for R2/MinIO) |
| `agent.flushIntervalSecs` | `300` | Time-based flush trigger |
| `agent.batchSize` | `1000` | Batch-size flush trigger |
| `agent.logPathPattern` | `/var/log/containers/*.log` | Log file glob pattern |
| `resources.limits.cpu` | `200m` | CPU limit per agent pod |
| `resources.limits.memory` | `256Mi` | Memory limit per agent pod |

### Environment Variables (Shannon Agent)

| Variable | Description |
|----------|-------------|
| `S3_BUCKET` | Target bucket name |
| `AWS_REGION` | Storage region (`auto` for R2) |
| `AWS_ACCESS_KEY_ID` | Storage credentials |
| `AWS_SECRET_ACCESS_KEY` | Storage credentials |
| `AWS_ENDPOINT_URL` | Custom endpoint (R2/MinIO) |
| `FLUSH_INTERVAL_SECS` | Time-based flush interval |
| `BATCH_SIZE` | Batch-size flush threshold |
| `LOG_PATH_PATTERN` | Log file glob pattern |
| `RUST_LOG` | Agent log level (`info`, `debug`, `warn`) |

---

## 📊 Query Examples

Once data is in R2, query it from the UI or DuckDB CLI:

### Count Errors by Service (Last 24 Hours)

```sql
SELECT 
    service,
    COUNT(*) as error_count
FROM read_parquet('s3://bucket/year=2026/month=03/*.parquet')
WHERE level = 'ERROR'
  AND timestamp >= (EXTRACT(EPOCH FROM NOW()) - 86400) * 1000
GROUP BY service
ORDER BY error_count DESC;
```

### Find Connection Timeout Patterns

```sql
SELECT 
    strftime(TIMESTAMP 'epoch' + timestamp * INTERVAL '1ms', '%Y-%m-%d %H:%M') as minute,
    service,
    COUNT(*) as count
FROM read_parquet('s3://bucket/year=2026/month=03/day=03/*.parquet')
WHERE message LIKE '%connection timeout%'
GROUP BY minute, service
ORDER BY minute DESC;
```

### Time-Bucketed Error Rate (for Charts)

```sql
SELECT 
    time_bucket(INTERVAL '5 minutes', TIMESTAMP 'epoch' + timestamp * INTERVAL '1ms') as bucket,
    COUNT_IF(level = 'ERROR') as errors,
    COUNT_IF(level = 'WARN') as warnings
FROM read_parquet('s3://bucket/year=2026/month=03/*.parquet')
GROUP BY bucket
ORDER BY bucket ASC;
```

---

## 🛡 Security

- **Non-root containers** - Agent runs as UID 65534
- **Read-only log mounts** - Cannot modify host files
- **No persistent credentials in images** - Use Kubernetes Secrets or IAM roles
- **Data encryption at rest** - R2/S3 server-side encryption
- **HTTPS-only** - All storage connections use TLS

### R2 CORS Configuration

For browser-based queries, configure your R2 bucket CORS policy:

```json
{
  "corsRules": [
    {
      "allowedOrigins": ["https://your-dashboard.pages.dev"],
      "allowedMethods": ["GET", "HEAD", "OPTIONS"],
      "allowedHeaders": ["Range", "Accept", "Origin", "Content-Type"],
      "exposeHeaders": ["Accept-Ranges", "Content-Length", "Content-Range"],
      "maxAgeSeconds": 3000
    }
  ]
}
```

Apply via Cloudflare Dashboard or:

```bash
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/r2/buckets/BUCKET_NAME/cors" \
  -H "Authorization: Bearer API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @cors-policy.json
```

---

## 💰 Cost Breakdown

### Scenario: 1TB of Logs Per Month

| Cost Component | Datadog | Splunk | **LogLess** |
|---------------|---------|--------|-------------|
| Ingestion | $500 | $2,500 | **$0** |
| Storage (30-day retention) | $100 | $50 | **$15** |
| Query Compute | Included | Included | **$0** |
| Egress (100GB queries) | $12 | $12 | **$0** (R2) |
| Dashboard Hosting | Included | Included | **$0** |
| **Total** | **~$612/mo** | **~$2,562/mo** | **~$15/mo** |

### 5-Year TCO (1TB/mo, 50 nodes)

| Platform | 5-Year Cost |
|----------|-------------|
| Datadog | $36,720 |
| Splunk | $153,720 |
| **LogLess** | **$900** |

**Savings: 97.5%**

---

## 🚧 Limitations (Be Honest)

LogLess is not a drop-in replacement for every observability use case. Here's what it's **not** designed for:

| Use Case | LogLess | Recommendation |
|----------|---------|----------------|
| **Real-time alerting** | ❌ No | Use Prometheus + Alertmanager for metrics |
| **Live tailing** | ⚠️ 5-min delay | Agent batches for efficiency |
| **Full log retention** | ✅ Yes | All logs stored in Parquet (query on demand) |
| **PII compliance** | ✅ Yes | Filter/mask at edge before upload |
| **Multi-team RBAC** | ❌ No | Use storage-level IAM policies |
| **Audit trails** | ⚠️ Manual | R2 access logs available |

**Philosophy:** LogLess is for **deep-dive debugging**, not real-time alerting. Use it alongside your existing metrics stack, not as a complete replacement.

---

## 🏃 Development

### Build the Shannon Agent

```bash
cd agent
cargo build --release
docker build -t logless-agent:latest .
```

### Run the UI Locally

```bash
cd ui
npm install
cp .env.example .env
# Edit .env with your R2 credentials
npm run dev  # Opens at http://localhost:5173
```

### Test the Helm Chart

```bash
helm lint charts/logless-agent
helm template logless-agent charts/logless-agent --set storage.bucket=test
```

---

## 🤝 Contributing

LogLess is open-source (MIT License). We welcome contributions in:

- **Rust agent optimizations** (simd-json, better compression)
- **DuckDB-Wasm performance** (query caching, prefetching)
- **UI improvements** (more chart types, saved views via URL params)
- **Storage backends** (GCS, Azure Blob, local MinIO testing)

**Not accepting:**
- Alerting features (violates architecture)
- Backend database requirements (breaks $0 infra promise)
- Proprietary format support (stay open)

---

## 📜 License

MIT License - See [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

LogLess stands on the shoulders of giants:

- **[DuckDB](https://duckdb.org)** - The SQLite of analytics
- **[Apache Arrow](https://arrow.apache.org)** - Columnar memory format
- **[Cloudflare R2](https://www.cloudflare.com/products/r2/)** - $0 egress storage
- **[linemux](https://github.com/rcoh/linemux)** - Async file tailing
- **[Vector.dev](https://vector.dev)** - Inspiration for edge observability

---

## 📬 Contact

- **GitHub Issues:** [github.com/logless-io/logless/issues](https://github.com/logless-io/logless/issues)
- **Discord:** [discord.gg/logless](https://discord.gg/logless)
- **Twitter:** [@logless_io](https://twitter.com/logless_io)

---

<p align="center">
  <strong>Built for engineers who read their own logs.</strong>
</p>

<p align="center">
  <a href="https://github.com/logless-io/logless">
    <img src="https://img.shields.io/github/stars/logless-io/logless?style=social" alt="GitHub Stars" />
  </a>
</p>
