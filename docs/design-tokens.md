# Design Tokens

Fonte canônica: `src/app/globals.css`.
Paleta alinhada a INTAKE 2.20 (**azul + neutro profissional**) — escolhida a partir de `ai-forge/design-foundry/palettes/`: **Indigo Stripe** (light) + **Deep Navy Electric** (dark). Indigo é uma variante de azul; decisão registrada em ADR-0004.

Neutros base: escala `slate`/`zinc` do Tailwind (grayscale frio), aplicados via `--muted`, `--border`, `--muted-foreground`.

---

## Core palette

| Token | Light | Dark | Uso |
|-------|-------|------|-----|
| `--background` | `#FFFFFF` | `#0C1120` | Fundo raiz (body) |
| `--foreground` | `#111827` | `#F8FAFC` | Texto raiz |
| `--card` | `#F9FAFB` | `#162032` | Card bg |
| `--card-foreground` | `#111827` | `#F8FAFC` | Texto em card |
| `--popover` | `#FFFFFF` | `#162032` | Popover/menu bg |
| `--popover-foreground` | `#111827` | `#F8FAFC` | Texto em popover |
| `--primary` | `#4F46E5` | `#3A82FF` | Ação primária, link |
| `--primary-foreground` | `#FFFFFF` | `#FFFFFF` | Texto sobre primary |
| `--secondary` | `#6366F1` | `#162032` | Ação secundária |
| `--secondary-foreground` | `#FFFFFF` | `#F8FAFC` | Texto sobre secondary |
| `--muted` | `#F3F4F6` | `#162032` | Superfícies desaturadas |
| `--muted-foreground` | `#9CA3AF` | `#64748B` | Texto auxiliar (labels, helper) |
| `--accent` | `#F3F4F6` | `#1E3A5F` | Hover/active backgrounds |
| `--accent-foreground` | `#111827` | `#BFDBFE` | Texto sobre accent |
| `--destructive` | `#DC2626` | `#FB7185` | Erro, remoção |
| `--destructive-foreground` | `#FFFFFF` | `#4C0519` | Texto sobre destructive |
| `--border` | `#E5E7EB` | `#1E3A5F` | Borda padrão |
| `--input` | `#E5E7EB` | `#1E3A5F` | Borda de input |
| `--ring` | `#4F46E5` | `#3A82FF` | `:focus-visible` outline, anéis de foco |

## Semantic (status)

| Token | Light | Dark | Uso |
|-------|-------|------|-----|
| `--color-success` | `#059669` | `#34D399` | Sucesso |
| `--color-success-foreground` | `#FFFFFF` | `#064E3B` | Texto sobre success |
| `--color-warning` | `#D97706` | `#FBBF24` | Aviso, banner offline (TASK-19) |
| `--color-warning-foreground` | `#FFFFFF` | `#78350F` | Texto sobre warning |
| `--color-info` | `#0284C7` | `#38BDF8` | Informação |
| `--color-info-foreground` | `#FFFFFF` | `#0C4A6E` | Texto sobre info |
| `--color-text-secondary` | `#6B7280` | `#8895A7` | Texto secundário (fora do semantico muted) |

## Radius

| Token | Valor | Uso |
|-------|-------|-----|
| `--radius` | `0.5rem` | Raiz; cards, botões padrão |
| `--radius-lg` | = `--radius` | Cards maiores |
| `--radius-md` | `calc(var(--radius) * 0.8)` | Inputs, selects |
| `--radius-sm` | `calc(var(--radius) * 0.6)` | Badges, tags |

## Shadows

| Token | Uso |
|-------|-----|
| `--shadow-xs` | Separadores sutis |
| `--shadow-sm` | Cards, dropdowns |
| `--shadow-md` | Popovers, menus |
| `--shadow-lg` | Modals, dialogs |
| `--shadow-xl` | Overlays destacados |

## Durations

| Token | Valor | Uso |
|-------|-------|-----|
| `--duration-fast` | `120ms` | Hover, focus |
| `--duration-normal` | `180ms` | Enter/leave padrão |
| `--duration-slow` | `300ms` | Transitions grandes (drawers) |

> `prefers-reduced-motion` anula essas durações para `0.01ms` globalmente.

## Sidebar tokens

Sub-escalas dedicadas ao `AppShell`/`Sidebar`: `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-ring`. Permitem tema lateral distinto do body sem quebrar contraste.

---

## Regras transversais

### `:focus-visible` global (TASK-21/ST002)

```css
@layer base {
  :focus { outline: none; }
  :focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
    border-radius: 2px;
  }
}
```

- Todo elemento focável herda o outline automaticamente.
- Componentes nunca devem resetar `outline` sem substituir por algo equivalente em contraste.
- Validação: rodar `axe-core` via Playwright nas 10 páginas-chave listadas na seção _Checklist de validação visual_ abaixo.

### Contrast ratio

- Texto normal ≥ **4.5:1** (WCAG AA).
- Texto large (≥18pt ou ≥14pt bold) ≥ **3:1**.
- UI components / focus ring ≥ **3:1** contra fundo adjacente.
- Qualquer alteração de `--primary`/`--foreground` exige rodar `axe-core` antes de mergear.

### Reduced motion

- `@media (prefers-reduced-motion: reduce)` zera durações globalmente. Nunca sobrescrever sem também respeitar a media query.

---

## Checklist de validação visual (ressalva TASK-21)

Screenshots antes/depois nas 10 páginas abaixo **ficam como PENDING** — requer ambiente com navegador para capturar:

1. `/` (landing)
2. `/login`
3. `/dashboard`
4. `/leads`
5. `/leads/[id]`
6. `/coletas`
7. `/admin/convites`
8. `/admin/config`
9. `/profile`
10. `/settings/notifications`

Rodar:
```bash
npx playwright test tests/visual/design-tokens.spec.ts
npx axe-core --exit
```

Caso violações de contraste WCAG AA apareçam, ajustar o token específico (`--muted-foreground`, `--color-text-secondary`) e repetir.

---

## Referências

- Paletas: `ai-forge/design-foundry/palettes/`
- ADR-0004 — Sistema visual Indigo Stripe + Deep Navy Electric.
- `tailwind.config.ts` — mapeamento dos tokens para utilitários Tailwind.
- TASK-21 (intake-review) — CL-439, CL-504.
