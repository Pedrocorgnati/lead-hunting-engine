/**
 * Script de build-time: gera openapi.json na raiz do projeto.
 *
 * Cobre: TASK-3/ST004.
 *
 * Uso: npm run openapi:generate
 *
 * CI: roda este script e falha se openapi.json tiver diff uncommitted
 * (detecta breaking changes de contrato em PRs).
 */

import * as fs from 'fs'
import * as path from 'path'

// Registrar path handlers (side-effects)
import '../src/lib/openapi/paths/auth.paths'
import '../src/lib/openapi/paths/leads.paths'
import '../src/lib/openapi/paths/jobs.paths'
import '../src/lib/openapi/paths/exports.paths'

import { generateOpenApiDocument } from '../src/lib/openapi/generate'

const spec = generateOpenApiDocument()
const outputPath = path.resolve(process.cwd(), 'openapi.json')

fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2) + '\n', 'utf-8')
console.log(`openapi.json gerado em ${outputPath}`)
console.log(`  Paths registrados: ${Object.keys(spec.paths ?? {}).length}`)
