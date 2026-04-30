-- M12-G03: adiciona XLSX como 4o formato de exportacao
-- Alinha BUDGET.md "exportacao em planilha em quatro formatos diferentes".

ALTER TYPE "ExportFormat" ADD VALUE IF NOT EXISTS 'XLSX';
