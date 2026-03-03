import React, { useEffect, useState } from 'react';
import { duckdbClient } from './duckdb/client';
import { TimeRangePicker } from './components/TimeRangePicker';
import { QueryBar } from './components/QueryBar';
import { ErrorTimeSeriesChart } from './components/ErrorTimeSeriesChart';
import { LogTable } from './components/LogTable';
import { LogEntry, LogStats, TimeBucketEntry } from './types/log';

export function App() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeBucketEntry[]>([]);
  const [timeRange, setTimeRange] = useState({
    start: new Date(Date.now() - 3600000),
    end: new Date(),
  });
  const [searchPattern, setSearchPattern] = useState('');

  const r2Config = {
    bucket: import.meta.env.VITE_R2_BUCKET || 'logless-logs',
    accessKeyId: import.meta.env.VITE_R2_ACCESS_KEY || '',
    secretAccessKey: import.meta.env.VITE_R2_SECRET_KEY || '',
    endpoint: import.meta.env.VITE_R2_ENDPOINT || '',
    region: 'auto',
  };

  useEffect(() => {
    async function init() {
      try {
        await duckdbClient.initialize();
        await duckdbClient.configureS3(
          r2Config.accessKeyId,
          r2Config.secretAccessKey,
          r2Config.endpoint,
          r2Config.region
        );
        setInitialized(true);
        console.log('🚀 LogLess UI ready');
      } catch (error) {
        console.error('Failed to initialize DuckDB:', error);
      }
    }
    init();

    return () => {
      duckdbClient.close();
    };
  }, []);

  const fetchLogs = async () => {
    if (!initialized) return;
    
    setLoading(true);
    try {
      const [logsResult, statsResult, timeSeriesResult] = await Promise.all([
        duckdbClient.queryLogs(r2Config.bucket, timeRange.start, timeRange.end, searchPattern),
        duckdbClient.getLogStats(r2Config.bucket, timeRange.start, timeRange.end),
        duckdbClient.getTimeSeriesData(r2Config.bucket, timeRange.start, timeRange.end, 5),
      ]);

      setLogs(logsResult);
      setStats(statsResult);
      setTimeSeriesData(timeSeriesResult);
    } catch (error) {
      console.error('Query failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounce = setTimeout(fetchLogs, 500);
    return () => clearTimeout(debounce);
  }, [timeRange, searchPattern, initialized]);

  if (!initialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-xl">Initializing Query Engine...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-blue-400">🪵 LogLess</h1>
        <p className="text-gray-400">Zero-ETL Edge Telemetry Dashboard</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        <div className="lg:col-span-1 space-y-4">
          {stats.map((stat) => (
            <div key={stat.level} className="bg-gray-800 rounded-lg p-4">
              <div className={`text-2xl font-bold ${
                stat.level === 'ERROR' ? 'text-red-400' :
                stat.level === 'WARN' ? 'text-yellow-400' : 'text-green-400'
              }`}>
                {stat.count.toLocaleString()}
              </div>
              <div className="text-gray-400">{stat.level}</div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-3 space-y-4">
          <TimeRangePicker
            value={timeRange}
            onChange={setTimeRange}
          />
          <QueryBar
            value={searchPattern}
            onChange={setSearchPattern}
            onSearch={fetchLogs}
            loading={loading}
          />
        </div>
      </div>

      <ErrorTimeSeriesChart 
        data={timeSeriesData} 
        loading={loading} 
        timeRange={timeRange} 
      />

      <div className="mt-6">
        <LogTable logs={logs} loading={loading} />
      </div>

      <footer className="mt-8 text-center text-gray-500 text-sm">
        <p>
          Powered by DuckDB-Wasm • Data stored in Cloudflare R2 • 
          <span className="text-green-400"> $0.00/mo infrastructure</span>
        </p>
      </footer>
    </div>
  );
}
