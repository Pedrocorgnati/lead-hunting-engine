'use client'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ArrowUpDown } from 'lucide-react'

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  loading?: boolean
  emptyMessage?: string
  emptyDescription?: string
  className?: string
}

export function DataTable<TData>({
  columns, data = [], loading, emptyMessage = 'Nenhum item encontrado',
  emptyDescription, className
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  })

  if (loading) {
    return (
      <div className="space-y-3" role="status" aria-label="Carregando dados">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 w-full animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    )
  }

  return (
    <div className={cn('rounded-md border overflow-auto', className)}>
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th
                  key={header.id}
                  className={cn(
                    'h-12 px-4 text-left font-medium text-muted-foreground',
                    header.column.getCanSort() && 'cursor-pointer select-none hover:text-foreground'
                  )}
                  scope="col"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <div className="flex items-center gap-1">
                    {header.isPlaceholder ? null : flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    {header.column.getCanSort() && (
                      <ArrowUpDown className="h-3.5 w-3.5" aria-hidden />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center py-12">
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <p className="font-medium text-foreground">{emptyMessage}</p>
                  {emptyDescription && <p className="text-sm">{emptyDescription}</p>}
                </div>
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map(row => (
              <tr
                key={row.id}
                className="border-t hover:bg-muted/30 transition-colors"
              >
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
