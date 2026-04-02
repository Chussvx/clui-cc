declare module 'unidiff' {
  export function diffAsText(
    oldStr: string,
    newStr: string,
    options?: { aname?: string; bname?: string; context?: number }
  ): string
  export function diffLines(oldStr: string, newStr: string): unknown[]
  export function formatLines(lines: unknown[], options?: { aname?: string; bname?: string; context?: number }): string
}
