'use client'

import { useRef, useState, useCallback, type ChangeEvent } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import { Camera, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AvatarInitials } from '@/components/shared/avatar-initials'

interface AvatarUploaderProps {
  initialUrl: string | null
  displayName: string
  onChange?: (url: string | null) => void
}

const MAX_SIZE = 2 * 1024 * 1024
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp'])

export function AvatarUploader({
  initialUrl,
  displayName,
  onChange,
}: AvatarUploaderProps) {
  const [url, setUrl] = useState<string | null>(initialUrl)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const submitFile = useCallback(
    async (file: File) => {
      if (!ALLOWED.has(file.type)) {
        toast.error('Formato nao suportado. Use PNG, JPG ou WebP.')
        return
      }
      if (file.size > MAX_SIZE) {
        toast.error('Arquivo excede 2MB.')
        return
      }

      setUploading(true)
      try {
        const body = new FormData()
        body.append('file', file)
        const res = await fetch('/api/v1/profile/avatar', {
          method: 'POST',
          body,
          credentials: 'include',
        })
        const json = await res.json()
        if (!res.ok) {
          throw new Error(json?.error?.message ?? 'Falha ao enviar avatar.')
        }
        const nextUrl: string | null = json?.data?.avatarUrl ?? null
        setUrl(nextUrl)
        onChange?.(nextUrl)
        toast.success('Avatar atualizado.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro inesperado.')
      } finally {
        setUploading(false)
      }
    },
    [onChange]
  )

  async function handleRemove() {
    if (!url) return
    setRemoving(true)
    try {
      const res = await fetch('/api/v1/profile/avatar', {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message ?? 'Falha ao remover avatar.')
      }
      setUrl(null)
      onChange?.(null)
      toast.success('Avatar removido.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro inesperado.')
    } finally {
      setRemoving(false)
    }
  }

  function onInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void submitFile(file)
    e.target.value = ''
  }

  return (
    <div
      data-testid="avatar-uploader"
      className="flex flex-wrap items-center gap-4"
      onDragEnter={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file) void submitFile(file)
      }}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-label={url ? 'Trocar foto de perfil' : 'Enviar foto de perfil'}
        className={
          'relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border ' +
          (isDragging
            ? 'border-primary ring-2 ring-primary'
            : 'border-border focus-visible:ring-2 focus-visible:ring-ring')
        }
      >
        {url ? (
          <Image
            src={url}
            alt={`Foto de ${displayName}`}
            fill
            sizes="80px"
            className="object-cover"
          />
        ) : (
          <AvatarInitials name={displayName} size="lg" />
        )}
        <div
          className={
            'absolute inset-0 flex items-center justify-center rounded-full bg-black/40 transition-opacity ' +
            (uploading ? 'opacity-100' : 'opacity-0 hover:opacity-100')
          }
          aria-hidden="true"
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          ) : (
            <Camera className="h-5 w-5 text-white" />
          )}
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={onInput}
        className="hidden"
        aria-hidden="true"
      />

      <div className="space-y-2">
        <div>
          <p className="text-sm font-medium text-foreground">Foto de perfil</p>
          <p className="text-xs text-muted-foreground">
            PNG, JPG ou WebP. Ate 2 MB. Arraste ou clique para enviar.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Enviando...' : url ? 'Trocar' : 'Enviar'}
          </Button>
          {url && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={removing}
              className="text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="mr-1 h-4 w-4" aria-hidden={true} />
              {removing ? 'Removendo...' : 'Remover'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
