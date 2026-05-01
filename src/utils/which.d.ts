declare module 'which' {
  export function sync(name: string, options?: { cwd?: string }): string | undefined
}
