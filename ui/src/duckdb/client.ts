import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm-bundle/duckdb-wasm.wasm';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm-bundle/duckdb-wasm.wasm';
import { Worker } from 'worker-loader';

const worker = new Worker(
  new URL('@duckdb/duckdb-wasm-bundle/duckdb-browser-eh.worker.js', import.meta.url)
);

export class DuckDBClient {
  private db: duckdb.AsyncDuckDB | null = null;
  private conn: duckdb.AsyncDuckDBConnection | null = null;

  async initialize(): Promise<void> {
    const bundle = await duckdb.selectBundle({
      mvp: {
        mainModule: duckdb_wasm,
        mainWorker: new URL('@duckdb/duckdb-wasm-bundle/duckdb-browser-eh.worker.js', import.meta.url).toString(),
      },
      eh: {
        mainModule: duckdb_wasm_eh,
        mainWorker: new URL('@duckdb/duckdb-wasm-bundle/duckdb-browser-eh.worker.js', import.meta.url).toString(),
      },
    });

    this.db = new duckdb.AsyncDuckDB(bundle.mainModule, bundle.mainWorker);
    await this.db.instantiate(worker);
    this.conn = await this.db.connect();

    await this.conn.query(`
      INSTALL httpfs;
      LOAD httpfs;
    `);

    console.log('✅ DuckDB-Wasm initialized');
  }

  async configureS3(accessKeyId: string, secretAccessKey: string, endpoint: string, region: string): Promise<void> {
    if (!this.conn) throw new Error('DuckDB not initialized');

    await this.conn.query(`
      SET s3_access_key_id='${accessKeyId}';
      SET s3_secret_access_key='${secretAccessKey}';
      SET s3_endpoint='${endpoint}';
      SET s3_region='${region}';
      SET s3_use_ssl=true;
    `);

    console.log('✅ S3/R2 configured');
  }

  async queryLogs(
    bucket: string,
    startTime: Date,
    endTime: Date,
    searchPattern?: string
  ): Promise<any[]> {
    if (!this.conn) throw new Error('DuckDB not initialized');

    const startYear = startTime.getFullYear();
    const startMonth = String(startTime.getMonth() + 1).padStart(2, '0');
    const startDay = String(startTime.getDate()).padStart(2, '0');

    const pathGlob = `s3://${bucket}/year=${startYear}/month=${startMonth}/day=${startDay}/*.parquet`;

    let query = `
      SELECT 
        timestamp,
        level,
        service,
        message
      FROM read_parquet('${pathGlob}')
      WHERE timestamp >= ${startTime.getTime()}
        AND timestamp <= ${endTime.getTime()}
    `;

    if (searchPattern) {
      query += ` AND message LIKE '%${searchPattern}%'`;
    }

    query += ` ORDER BY timestamp DESC LIMIT 1000`;

    const result = await this.conn.query(query);
    return result.toArray();
  }

  async getLogStats(bucket: string, startTime: Date, endTime: Date): Promise<any> {
    if (!this.conn) throw new Error('DuckDB not initialized');

    const startYear = startTime.getFullYear();
    const startMonth = String(startTime.getMonth() + 1).padStart(2, '0');
    const pathGlob = `s3://${bucket}/year=${startYear}/month=${startMonth}/*.parquet`;

    const query = `
      SELECT 
        level,
        COUNT(*) as count,
        MIN(timestamp) as first_seen,
        MAX(timestamp) as last_seen
      FROM read_parquet('${pathGlob}')
      WHERE timestamp >= ${startTime.getTime()}
        AND timestamp <= ${endTime.getTime()}
      GROUP BY level
      ORDER BY count DESC
    `;

    const result = await this.conn.query(query);
    return result.toArray();
  }

  async getTimeSeriesData(
    bucket: string,
    startTime: Date,
    endTime: Date,
    bucketIntervalMinutes: number = 5
  ): Promise<any[]> {
    if (!this.conn) throw new Error('DuckDB not initialized');

    const startYear = startTime.getFullYear();
    const startMonth = String(startTime.getMonth() + 1).padStart(2, '0');
    const pathGlob = `s3://${bucket}/year=${startYear}/month=${startMonth}/*.parquet`;

    const query = `
      SELECT 
        strftime(
          time_bucket(INTERVAL '${bucketIntervalMinutes} minutes', TIMESTAMP 'epoch' + timestamp * INTERVAL '1 millisecond'),
          '%Y-%m-%d %H:%M:00'
        ) AS bucket,
        COUNT_IF(level = 'ERROR') AS ERROR,
        COUNT_IF(level = 'WARN') AS WARN,
        COUNT_IF(level = 'INFO') AS INFO
      FROM read_parquet('${pathGlob}')
      WHERE timestamp >= ${startTime.getTime()}
        AND timestamp <= ${endTime.getTime()}
      GROUP BY bucket
      ORDER BY bucket ASC
    `;

    const result = await this.conn.query(query);
    return result.toArray();
  }

  async close(): Promise<void> {
    if (this.conn) {
      await this.conn.close();
      this.conn = null;
    }
    if (this.db) {
      await this.db.terminate();
      this.db = null;
    }
  }
}

export const duckdbClient = new DuckDBClient();
