# Makefile — Lead Hunting Engine
# Gerado por /dev-bootstrap-create (SystemForge)
# Uso: make [target]

.PHONY: help setup reset dev build test lint type-check seed docker-up docker-down docker-clean health ci

help:
	@echo "Lead Hunting Engine — Targets disponiveis:"
	@echo ""
	@echo "  Setup & Operacao:"
	@echo "    make setup           Instalacao completa (primeiro setup)"
	@echo "    make reset           Reset completo (development fresh)"
	@echo "    make health          Verifica saude do ambiente"
	@echo ""
	@echo "  Desenvolvimento:"
	@echo "    make dev             Inicia dev server (next dev)"
	@echo "    make build           Produz build"
	@echo "    make start           Inicia servidor (producao)"
	@echo ""
	@echo "  Qualidade:"
	@echo "    make test            Roda testes (jest)"
	@echo "    make test-int        Roda testes de integracao"
	@echo "    make test-all        Roda todos os testes"
	@echo "    make lint            Lint (eslint)"
	@echo "    make type-check      Type check (tsc)"
	@echo ""
	@echo "  Dados:"
	@echo "    make seed-dev        Carrega dados de desenvolvimento"
	@echo "    make seed-test       Carrega dados para testes"
	@echo "    make seed-prod       Carrega dados de producao"
	@echo ""
	@echo "  Docker:"
	@echo "    make docker-up       Sobe servicos (docker compose up -d)"
	@echo "    make docker-down     Desce servicos"
	@echo "    make docker-clean    Desce + remove volumes (-v)"
	@echo "    make docker-build    Build da imagem de producao"
	@echo ""
	@echo "  CI/CD:"
	@echo "    make ci              Roda checks de CI (lint + type-check + test)"
	@echo ""

# === Bootstrap (gerado por /dev-bootstrap-create) ===
setup:
	@./scripts/bootstrap.sh

reset:
	@./scripts/bootstrap.sh --reset

health:
	@./scripts/bootstrap.sh --health

# === Desenvolvimento ===
dev:
	@npm run dev

build:
	@npm run build

start:
	@npm run start

# === Qualidade ===
test:
	@npm run test

test-int:
	@npm run test:integration

test-all:
	@npm run test:all

lint:
	@npm run lint

type-check:
	@npm run type-check

# === Dados ===
seed-dev:
	@npm run seed:dev

seed-test:
	@npm run seed:test

seed-prod:
	@npm run seed:prod

# === Docker ===
docker-up:
	@npm run docker:dev

docker-down:
	@npm run docker:down

docker-clean:
	@npm run docker:clean

docker-build:
	@npm run docker:prod:build

# === CI/CD ===
ci: lint type-check test
	@echo "✓ CI checks passed"
