import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

// ─── Button ───────────────────────────────────────────────────────────────────
const ButtonMeta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
}
export default ButtonMeta

export const Default: StoryObj<typeof Button> = { args: { children: 'Clique aqui' } }
export const Destructive: StoryObj<typeof Button> = { args: { children: 'Excluir', variant: 'destructive' } }
export const Outline: StoryObj<typeof Button> = { args: { children: 'Cancelar', variant: 'outline' } }
export const Loading: StoryObj<typeof Button> = { args: { children: 'Salvando...', disabled: true } }

// ─── Input ────────────────────────────────────────────────────────────────────
export const InputDefault: StoryObj = {
  name: 'UI/Input — Default',
  render: () => <Input placeholder="Digite algo..." aria-label="Campo de texto" />,
}

// ─── Badge ────────────────────────────────────────────────────────────────────
export const BadgeDefault: StoryObj = {
  name: 'UI/Badge — Variants',
  render: () => (
    <div className="flex gap-2 flex-wrap">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secundário</Badge>
      <Badge variant="destructive">Erro</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
}

// ─── Alert ────────────────────────────────────────────────────────────────────
export const AlertDefault: StoryObj = {
  name: 'UI/Alert — Default',
  render: () => (
    <Alert>
      <p>Esta é uma mensagem de alerta.</p>
    </Alert>
  ),
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export const CardDefault: StoryObj = {
  name: 'UI/Card — Default',
  render: () => (
    <Card className="w-64">
      <CardHeader><CardTitle>Título do Card</CardTitle></CardHeader>
      <CardContent><p className="text-sm text-muted-foreground">Conteúdo do card.</p></CardContent>
    </Card>
  ),
}

// ─── Dialog ───────────────────────────────────────────────────────────────────
export const DialogDefault: StoryObj = {
  name: 'UI/Dialog — Default',
  render: () => (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline">Abrir Modal</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Título do Modal</DialogTitle></DialogHeader>
        <p className="text-sm">Conteúdo do modal aqui.</p>
      </DialogContent>
    </Dialog>
  ),
}

// ─── Dropdown ─────────────────────────────────────────────────────────────────
export const DropdownDefault: StoryObj = {
  name: 'UI/DropdownMenu — Default',
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline">Opções</Button></DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Editar</DropdownMenuItem>
        <DropdownMenuItem>Duplicar</DropdownMenuItem>
        <DropdownMenuItem className="text-destructive">Excluir</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}

// ─── Select ───────────────────────────────────────────────────────────────────
export const SelectDefault: StoryObj = {
  name: 'UI/Select — Default',
  render: () => (
    <Select>
      <SelectTrigger className="w-48" aria-label="Selecione uma opção">
        <SelectValue placeholder="Selecione..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="opt1">Opção 1</SelectItem>
        <SelectItem value="opt2">Opção 2</SelectItem>
        <SelectItem value="opt3">Opção 3</SelectItem>
      </SelectContent>
    </Select>
  ),
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
export const SkeletonDefault: StoryObj = {
  name: 'UI/Skeleton — Default',
  render: () => (
    <div className="space-y-2 w-64">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  ),
}

// ─── Toast ────────────────────────────────────────────────────────────────────
export const ToastDefault: StoryObj = {
  name: 'UI/Toast — Default',
  render: () => (
    <Button onClick={() => toast.success('Operação concluída!')}>
      Mostrar Toast
    </Button>
  ),
}
