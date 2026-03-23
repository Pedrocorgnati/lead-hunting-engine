import { z } from 'zod'

const DataSourceEnum = z.enum([
  'GOOGLE_MAPS', 'INSTAGRAM', 'FACEBOOK', 'WEBSITE', 'YELP',
  'APONTADOR', 'GUIA_MAIS', 'LINKEDIN_COMPANY', 'HERE_PLACES',
  'TOMTOM', 'OUTSCRAPER', 'APIFY', 'SHOPEE', 'MERCADOLIVRE', 'OVERTURE_MAPS',
])

export const CreateJobSchema = z.object({
  city: z.string().min(2, 'Mínimo 2 caracteres').max(255),
  state: z.string().max(100).nullable().optional(),
  niche: z.string().min(2, 'Mínimo 2 caracteres').max(255),
  sources: z.array(DataSourceEnum).min(1, 'Selecione ao menos uma fonte'),
  limit: z.number().int().min(1).max(500).nullable().optional(),
})

export type CreateJobInput = z.infer<typeof CreateJobSchema>
