import React from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { LogEntry } from '../types/log';

interface LogTableProps {
  logs: LogEntry[];
  loading: boolean;
}

export function LogTable({ logs, loading }: LogTableProps) {
  const rowData = logs.map((log) => ({
    ...log,
    timestamp: new Date(log.timestamp).toISOString(),
  }));

  const columnDefs = [
    { field: 'timestamp', headerName: 'Timestamp', width: 200 },
    { 
      field: 'level', 
      width: 100,
      cellRenderer: (params: any) => (
        <span className={`px-2 py-1 rounded text-xs font-bold ${
          params.value === 'ERROR' ? 'bg-red-900 text-red-300' :
          params.value === 'WARN' ? 'bg-yellow-900 text-yellow-300' :
          'bg-green-900 text-green-300'
        }`}>
          {params.value}
        </span>
      ),
    },
    { field: 'service', headerName: 'Service', width: 150 },
    { field: 'message', headerName: 'Message', flex: 1, autoHeight: true },
  ];

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-xl font-semibold">Log Results ({logs.length} rows)</h2>
      </div>
      
      {loading ? (
        <div className="p-12 text-center text-gray-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Querying Parquet files from R2...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="p-12 text-center text-gray-400">
          <p>No logs found for this time range</p>
        </div>
      ) : (
        <div className="h-[600px] ag-theme-alpine-dark">
          <AgGridReact
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={{
              sortable: true,
              filter: true,
              resizable: true,
            }}
            pagination={true}
            paginationPageSize={50}
          />
        </div>
      )}
    </div>
  );
}
