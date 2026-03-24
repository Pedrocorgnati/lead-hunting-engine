export default function AppLoading() {
  return (
    <div data-testid="app-loading" className="flex flex-col gap-4 p-4 md:p-6">
      {/* Page title skeleton */}
      <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
      {/* Content skeleton — 4 cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
      {/* Main content block */}
      <div className="h-64 rounded-lg bg-muted animate-pulse" />
    </div>
  )
}
