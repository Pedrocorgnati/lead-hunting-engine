import type { Metadata } from 'next'
import Link from 'next/link'
import { Routes } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'Termos de Uso | Lead Hunting Engine',
}

export default function TermosPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-foreground mb-2">Termos de Uso</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Ao utilizar o Lead Hunting Engine, você concorda com os termos descritos
          nesta página.
        </p>

        <div className="space-y-4 text-sm text-muted-foreground">
          <p>
            Os dados coletados referem-se a informações públicas de pessoas
            jurídicas, conforme Art. 7, inciso IX da Lei Geral de Proteção de Dados
            (LGPD — Lei 13.709/2018), com base no legítimo interesse do controlador.
          </p>

          <p>
            O Lead Hunting Engine coleta e processa dados de contato de empresas
            obtidos de fontes públicas para fins de prospecção comercial B2B. Não são
            coletados dados pessoais sensíveis conforme definição do Art. 5, II da
            LGPD.
          </p>

          <p>
            O aceite destes termos é registrado com data e hora no momento da
            ativação da conta, em conformidade com as obrigações de rastreabilidade
            previstas na LGPD.
          </p>

          <p className="text-xs border border-dashed border-muted px-3 py-2 rounded">
            Conteúdo completo a ser redigido e revisado por assessoria jurídica antes
            do deploy em produção. Esta é uma versão placeholder para fins de
            desenvolvimento.
          </p>
        </div>

        <section className="mt-8 pt-8 border-t">
          <h2 className="text-xl font-semibold text-foreground mb-4">Contato</h2>
          <p className="text-sm text-muted-foreground">
            Para exercer seus direitos previstos no Art. 18 da LGPD ou para dúvidas
            sobre este documento, entre em contato pelo email de suporte.
          </p>
        </section>

        <div className="mt-8">
          <Link
            href={Routes.LOGIN}
            className="text-primary hover:underline text-sm"
          >
            ← Voltar ao login
          </Link>
        </div>
      </div>
    </div>
  )
}
