export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="hidden h-4 min-w-4 items-center justify-center rounded border bg-muted px-1 font-sans text-[10px] text-muted-foreground sm:inline-flex">
      {children}
    </kbd>
  )
}
