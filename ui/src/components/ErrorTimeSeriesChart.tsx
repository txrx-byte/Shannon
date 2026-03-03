import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { TimeBucketEntry, TimeRange } from '../types/log';

interface ErrorTimeSeriesChartProps {
   TimeBucketEntry[];
  loading: boolean;
  timeRange: TimeRange;
}

export function ErrorTimeSeriesChart({ data, loading, timeRange }: ErrorTimeSeriesChartProps) {
  const chartData = useMemo(() => {
    return data.map((row) => ({
      time: format(parseISO(row.bucket), 'HH:mm'),
      ERROR: row.ERROR || 0,
      WARN: row.WARN || 0,
      INFO: row.INFO || 0,
      timestamp: row.bucket,
    }));
  }, [data]);

  const peakError = useMemo(() => {
    if (chartData.length === 0) return { time: '', count: 0 };
    const max = chartData.reduce((prev, current) => 
      (current.ERROR > prev.ERROR) ? current : prev
    );
    return {
      time: format(parseISO(max.timestamp), 'HH:mm'),
      count: max.ERROR,
    };
  }, [chartData]);

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-8 h-[300px] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Aggregating time-series data...</p>
        </div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-8 h-[300px] flex items-center justify-center">
        <p className="text-gray-400">No data available for this time range</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-white">Error Rate Over Time</h2>
        {peakError.count > 0 && (
          <div className="bg-red-900/50 border border-red-700 rounded px-3 py-1">
            <span className="text-red-400 text-sm">
              Peak: {peakError.count} errors at {peakError.time}
            </span>
          </div>
        )}
      </div>
      
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorError" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="colorWarn" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#eab308" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#eab308" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="time" stroke="#9ca3af" tick={{ fontSize: 12 }} />
            <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px',
              }}
              labelStyle={{ color: '#f3f4f6' }}
            />
            <Legend wrapperStyle={{ color: '#f3f4f6' }} />
            
            <Area
              type="monotone"
              dataKey="ERROR"
              stroke="#ef4444"
              fillOpacity={1}
              fill="url(#colorError)"
              name="Errors"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="WARN"
              stroke="#eab308"
              fillOpacity={1}
              fill="url(#colorWarn)"
              name="Warnings"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-700">
        <div className="text-center">
          <div className="text-2xl font-bold text-red-400">
            {chartData.reduce((sum, row) => sum + row.ERROR, 0).toLocaleString()}
          </div>
          <div className="text-gray-400 text-sm">Total Errors</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-yellow-400">
            {chartData.reduce((sum, row) => sum + row.WARN, 0).toLocaleString()}
          </div>
          <div className="text-gray-400 text-sm">Total Warnings</div>
        </div>
      </div>
    </div>
  );
}
