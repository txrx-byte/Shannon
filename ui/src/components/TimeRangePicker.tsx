import React from 'react';
import { format, subHours, subDays } from 'date-fns';
import { TimeRange } from '../types/log';

interface TimeRangePickerProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

export function TimeRangePicker({ value, onChange }: TimeRangePickerProps) {
  const presets = [
    { label: 'Last 1 Hour', start: subHours(new Date(), 1) },
    { label: 'Last 6 Hours', start: subHours(new Date(), 6) },
    { label: 'Last 24 Hours', start: subDays(new Date(), 1) },
    { label: 'Last 7 Days', start: subDays(new Date(), 7) },
  ];

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-3">Time Range</h3>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset.label}
            onClick={() => onChange({ start: preset.start, end: new Date() })}
            className={`px-3 py-1.5 rounded text-sm ${
              value.start.getTime() === preset.start.getTime()
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="mt-3 text-xs text-gray-500">
        {format(value.start, 'MMM d, HH:mm')} - {format(value.end, 'MMM d, HH:mm')}
      </div>
    </div>
  );
}
