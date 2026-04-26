'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { companyProfileSchema, type CompanyProfile } from '@/lib/schemas/onboarding'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface Props {
  initial?: Partial<CompanyProfile>
  onSubmit: (values: CompanyProfile) => void | Promise<void>
  submitting?: boolean
}

const COMPANY_TYPES: { value: CompanyProfile['companyType']; label: string }[] = [
  { value: 'B2B', label: 'B2B — Vendo para empresas' },
  { value: 'B2C', label: 'B2C — Vendo para consumidor final' },
  { value: 'B2B2C', label: 'B2B2C — Híbrido' },
]

export function StepCompanyProfile({ initial, onSubmit, submitting }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CompanyProfile>({
    resolver: zodResolver(companyProfileSchema),
    defaultValues: {
      companyName: initial?.companyName ?? '',
      companyType: initial?.companyType ?? 'B2B',
      cnpj: initial?.cnpj ?? '',
    },
  })

  return (
    <form
      data-testid="onboarding-step-company-profile"
      className="w-full space-y-4 text-left"
      onSubmit={handleSubmit(onSubmit)}
      noValidate
    >
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold text-foreground">Perfil da empresa</h2>
        <p className="text-sm text-muted-foreground">
          Conte quem você é para personalizar suas coletas.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="companyName">Nome da empresa</Label>
        <Input
          id="companyName"
          data-testid="onboarding-company-name-input"
          {...register('companyName')}
          aria-invalid={Boolean(errors.companyName)}
          aria-describedby={errors.companyName ? 'companyName-error' : undefined}
          autoComplete="organization"
        />
        {errors.companyName && (
          <p id="companyName-error" role="alert" className="text-xs text-destructive">
            {errors.companyName.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="companyType">Tipo de operação</Label>
        <select
          id="companyType"
          data-testid="onboarding-company-type-select"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          {...register('companyType')}
        >
          {COMPANY_TYPES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {errors.companyType && (
          <p role="alert" className="text-xs text-destructive">
            {errors.companyType.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cnpj">
          CNPJ <span className="text-muted-foreground">(opcional)</span>
        </Label>
        <Input
          id="cnpj"
          data-testid="onboarding-cnpj-input"
          placeholder="00.000.000/0000-00"
          {...register('cnpj')}
          aria-invalid={Boolean(errors.cnpj)}
          aria-describedby={errors.cnpj ? 'cnpj-error' : undefined}
          inputMode="numeric"
        />
        {errors.cnpj && (
          <p id="cnpj-error" role="alert" className="text-xs text-destructive">
            {errors.cnpj.message}
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          data-testid="onboarding-company-profile-submit"
          disabled={isSubmitting || submitting}
        >
          {isSubmitting || submitting ? 'Salvando...' : 'Continuar'}
        </Button>
      </div>
    </form>
  )
}
