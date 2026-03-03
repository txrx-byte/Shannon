use std::env;
use std::sync::Arc;
use std::time::Duration;

use arrow::array::{StringArray, TimestampMillisecondArray};
use arrow::record_batch::RecordBatch;
use arrow::datatypes::{DataType, Field, Schema, TimeUnit};
use parquet::arrow::ArrowWriter;
use chrono::Utc;
use tokio::sync::mpsc::{channel, Sender, Receiver};
use linemux::{MuxedLines, Line};
use tracing::{info, warn, error};
use aws_config::load_from_env;
use aws_sdk_s3::Client;

// Kubernetes container log JSON structure
#[derive(serde::Deserialize, Debug, Clone)]
struct K8sLogEntry {
    log: String,
    stream: String,
    time: String,
}

// Internal structured log after parsing
#[derive(Debug, Clone)]
struct StructuredLog {
    timestamp: i64,
    level: String,
    service: String,
    message: String,
}

// Message types for MPSC channel
enum WorkerMessage {
    Log(StructuredLog),
    Flush,
    Shutdown,
}

fn parse_log_level(raw_log: &str) -> Option<String> {
    let upper = raw_log.to_uppercase();
    if upper.contains("ERROR") || upper.contains("FATAL") || upper.contains("PANIC") {
        Some("ERROR".to_string())
    } else if upper.contains("WARN") || upper.contains("WARNING") {
        Some("WARN".to_string())
    } else if upper.contains("INFO") {
        Some("INFO".to_string())
    } else if upper.contains("DEBUG") || upper.contains("TRACE") {
        Some("DEBUG".to_string())
    } else {
        None
    }
}

fn should_keep(level: &Option<String>) -> bool {
    match level {
        Some(l) => matches!(l.as_str(), "ERROR" | "WARN" | "WARNING" | "FATAL" | "PANIC"),
        None => false,
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();
    info!("🚀 Shannon Agent v0.4.0 starting with async MPSC...");

    let bucket_name = env::var("S3_BUCKET").unwrap_or_else(|_| "logless-logs".to_string());
    let region = env::var("AWS_REGION").unwrap_or_else(|_| "auto".to_string());
    let flush_interval_secs = env::var("FLUSH_INTERVAL_SECS")
        .unwrap_or_else(|_| "300".to_string())
        .parse::<u64>()
        .unwrap_or(300);
    let batch_size = env::var("BATCH_SIZE")
        .unwrap_or_else(|_| "1000".to_string())
        .parse::<usize>()
        .unwrap_or(1000);
    let log_path = env::var("LOG_PATH_PATTERN")
        .unwrap_or_else(|_| "/var/log/containers/*.log".to_string());

    // Use Tokio's async MPSC channel (non-blocking)
    let (tx, rx): (Sender<WorkerMessage>, Receiver<WorkerMessage>) = channel(10000);

    // Spawn worker task for Arrow conversion + S3 upload
    let worker_handle = tokio::spawn(async move {
        worker_loop(rx, &bucket_name, &region).await;
    });

    // Initialize linemux for async file tailing
    info!("📁 Watching log files at: {}", log_path);
    let mut lines = MuxedLines::new()?;
    
    for entry in glob::glob(&log_path)? {
        match entry {
            Ok(path) => {
                match lines.add_file(&path) {
                    Ok(_) => info!("📄 Tailing: {:?}", path),
                    Err(e) => warn!("Failed to tail {:?}: {}", path, e),
                }
            }
            Err(e) => warn!("Glob error: {}", e),
        }
    }

    let mut log_count: usize = 0;
    let mut last_flush = Utc::now();
    let mut file_rescan_interval = tokio::time::interval(Duration::from_secs(60));
    let mut flush_interval = tokio::time::interval(Duration::from_secs(flush_interval_secs));

    info!("📡 Tailing active. Flushing every {}s or {} logs", flush_interval_secs, batch_size);

    loop {
        tokio::select! {
            // New log line received from any tailed file
            result = lines.next_line() => {
                match result {
                    Ok(Some(line)) => {
                        let line_str = line.trim();
                        if line_str.is_empty() {
                            continue;
                        }

                        if let Ok(entry) = serde_json::from_str::<K8sLogEntry>(line_str) {
                            let level = parse_log_level(&entry.log);
                            
                            if should_keep(&level) {
                                let structured = StructuredLog {
                                    timestamp: Utc::now().timestamp_millis(),
                                    level: level.unwrap_or_else(|| "UNKNOWN".to_string()),
                                    service: entry.stream.clone(),
                                    message: entry.log.trim().to_string(),
                                };

                                if tx.send(WorkerMessage::Log(structured)).await.is_ok() {
                                    log_count += 1;
                                }
                            }
                        }

                        if log_count >= batch_size {
                            let _ = tx.send(WorkerMessage::Flush).await;
                            log_count = 0;
                            last_flush = Utc::now();
                        }
                    }
                    Ok(None) => {
                        warn!("Unexpected EOF on log file");
                    }
                    Err(e) => {
                        error!("Error reading log line: {}", e);
                    }
                }
            }

            // Periodic flush by time interval
            _ = flush_interval.tick() => {
                if log_count > 0 {
                    info!("⏰ Time-based flush triggered ({} logs)", log_count);
                    let _ = tx.send(WorkerMessage::Flush).await;
                    log_count = 0;
                    last_flush = Utc::now();
                }
            }

            // Periodically rescan for new log files
            _ = file_rescan_interval.tick() => {
                for entry in glob::glob(&log_path)? {
                    match entry {
                        Ok(path) => {
                            let _ = lines.add_file(&path);
                        }
                        Err(e) => warn!("Glob rescan error: {}", e),
                    }
                }
            }

            // Handle shutdown signal
            _ = tokio::signal::ctrl_c() => {
                info!("🛑 Shutdown signal received");
                break;
            }
        }
    }

    // Final flush before shutdown
    info!("🔄 Final flush before shutdown...");
    let _ = tx.send(WorkerMessage::Flush).await;
    let _ = tx.send(WorkerMessage::Shutdown).await;
    
    worker_handle.await?;
    info!("👋 Shannon Agent shutting down gracefully");

    Ok(())
}

async fn worker_loop(rx: Receiver<WorkerMessage>, bucket_name: &str, region: &str) {
    let mut buffer: Vec<StructuredLog> = Vec::new();
    
    // Initialize S3 client (works with R2, MinIO, AWS S3)
    let sdk_config = load_from_env().await;
    let s3_client = Client::new(&sdk_config);

    loop {
        tokio::select! {
            recv(rx) -> msg => {
                match msg {
                    Some(WorkerMessage::Log(log)) => {
                        buffer.push(log);
                    }
                    Some(WorkerMessage::Flush) => {
                        if !buffer.is_empty() {
                            match flush_to_parquet(&buffer, &s3_client, bucket_name, region).await {
                                Ok(_) => info!("✅ Flushed {} logs", buffer.len()),
                                Err(e) => error!("❌ Flush failed: {}", e),
                            }
                            buffer.clear();
                        }
                    }
                    Some(WorkerMessage::Shutdown) | None => {
                        if !buffer.is_empty() {
                            let _ = flush_to_parquet(&buffer, &s3_client, bucket_name, region).await;
                        }
                        break;
                    }
                }
            }
        }
    }
}

async fn flush_to_parquet(
    entries: &[StructuredLog],
    s3_client: &Client,
    bucket: &str,
    region: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let now = Utc::now();
    
    let timestamps: Vec<i64> = entries.iter().map(|e| e.timestamp).collect();
    let levels: Vec<&str> = entries.iter().map(|e| e.level.as_str()).collect();
    let services: Vec<&str> = entries.iter().map(|e| e.service.as_str()).collect();
    let messages: Vec<&str> = entries.iter().map(|e| e.message.as_str()).collect();

    let schema = Arc::new(Schema::new(vec![
        Field::new("timestamp", DataType::Timestamp(TimeUnit::Millisecond, None), false),
        Field::new("level", DataType::Utf8, false),
        Field::new("service", DataType::Utf8, false),
        Field::new("message", DataType::Utf8, false),
    ]));

    let batch = RecordBatch::try_new(
        schema.clone(),
        vec![
            Arc::new(TimestampMillisecondArray::from(timestamps)),
            Arc::new(StringArray::from(levels)),
            Arc::new(StringArray::from(services)),
            Arc::new(StringArray::from(messages)),
        ],
    )?;

    let mut buf = Vec::new();
    {
        let mut writer = ArrowWriter::try_new(&mut buf, schema, None)?;
        writer.write(&batch)?;
        writer.close()?;
    }

    let path = format!(
        "year={}/month={:02}/day={:02}/hour={:02}/data_{}.parquet",
        now.year(),
        now.month(),
        now.day(),
        now.hour(),
        uuid::Uuid::new_v4()
    );

    s3_client
        .put_object()
        .bucket(bucket)
        .key(&path)
        .body(buf.into())
        .content_type("application/vnd.apache.parquet")
        .send()
        .await?;

    info!("📦 Uploaded to s3://{}/{}", bucket, path);
    Ok(())
}
