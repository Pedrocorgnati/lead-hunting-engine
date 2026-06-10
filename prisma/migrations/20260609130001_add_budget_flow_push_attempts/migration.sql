-- Task 52: contador de tentativas para terminalizar pushes apos esgotar retries
ALTER TABLE "budget_flow_pushes" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
