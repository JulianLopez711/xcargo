import React from 'react';
import '../../styles/Table.css';

interface Column {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

interface TableProps {
  columns: Column[];
  data: Record<string, any>[];
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
  responsive?: boolean;
}

export const Table: React.FC<TableProps> = ({
  columns,
  data,
  loading = false,
  emptyMessage = 'No hay datos disponibles',
  className = '',
  responsive = true,
}) => {
  const tableClass = `table ${responsive ? 'table--responsive' : ''} ${className}`.trim();

  if (loading) {
    return (
      <div className="table-loading">
        <div className="table-spinner" />
        <span>Cargando datos...</span>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className={tableClass}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                style={{
                  width: column.width,
                  textAlign: column.align || 'left'
                }}
                className={`table-header table-header--${column.align || 'left'}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="table-empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr key={index} className="table-row">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`table-cell table-cell--${column.align || 'left'}`}
                    style={{ textAlign: column.align || 'left' }}
                  >
                    {row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};