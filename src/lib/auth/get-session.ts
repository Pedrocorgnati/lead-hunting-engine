// Canonical exports for session management helpers.
// Workspace implements these in lib/auth.ts — re-exporting here for
// task-spec compatibility and forward compatibility with future refactors.
export {
  getAuthenticatedUser,
  getAuthenticatedUser as getAuthContext,
  requireAuth,
  requireAdmin,
  handleAuthError,
  AuthError,
  type AuthenticatedUser,
} from '@/lib/auth'
