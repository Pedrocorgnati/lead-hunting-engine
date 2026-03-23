export interface UserProfileDto {
  id: string
  email: string
  name: string
  role: string
  termsAcceptedAt: string | null
}

// TODO: Implementar backend — run /auto-flow execute
export async function getProfile(): Promise<UserProfileDto | null> {
  return null
}

// TODO: Implementar backend — run /auto-flow execute
export async function updateProfile(_data: { name: string }): Promise<{ success: boolean }> {
  throw new Error('Not implemented - run /auto-flow execute')
}

// TODO: Implementar backend — run /auto-flow execute
export async function requestAccountDeletion(): Promise<{ success: boolean }> {
  throw new Error('Not implemented - run /auto-flow execute')
}

// TODO: Implementar backend — run /auto-flow execute
export async function completeOnboarding(): Promise<{ success: boolean }> {
  throw new Error('Not implemented - run /auto-flow execute')
}
