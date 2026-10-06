/**
 * The collapsed-directory set of one changes tree, shared by the Git lens
 * (staged / unstaged sections) and the session lens: an immutable Set plus
 * the `isCollapsed` / `toggleDir` pair the directory rows render with.
 */
import { useCallback, useState } from 'react'

/**
 * Own one changes tree's collapsed-directory set.
 * @returns the set plus the `isCollapsed` / `toggleDir` pair the directory rows render with.
 */
export function useCollapsedDirs(): {
  collapsedDirs: ReadonlySet<string>
  isCollapsed: (path: string) => boolean
  toggleDir: (path: string) => void
} {
  const [collapsedDirs, setCollapsedDirs] = useState<ReadonlySet<string>>(() => new Set<string>())
  const isCollapsed = useCallback((path: string): boolean => collapsedDirs.has(path), [collapsedDirs])
  const toggleDir = useCallback((path: string): void => {
    setCollapsedDirs((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])
  return { collapsedDirs, isCollapsed, toggleDir }
}
