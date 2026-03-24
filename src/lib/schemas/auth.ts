// Re-exports from schemas/auth.schema.ts with task-spec canonical names.
// Both paths are valid — prefer importing from '@/schemas/auth.schema' for new code.
export {
  SignInSchema as loginSchema,
  ResetPasswordSchema as resetSchema,
  UpdatePasswordSchema as updatePasswordSchema,
  type SignInInput as LoginInput,
  type ResetPasswordInput as ResetInput,
  type UpdatePasswordInput,
} from '@/schemas/auth.schema'
