/** An existing web demo opened from its owner's Studio project list. */
export type ExternalWebDemo = {
  kind: 'external-web-demo'
  id: string
  title: string
  url: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasControlCharacters(value: string, includeSpace = false): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code < (includeSpace ? 33 : 32) || code === 127) return true
  }
  return false
}

/** Normalize an absolute web URL without executing, fetching or authorizing it. */
export function normalizePresentationUrl(value: unknown): string | null {
  if (typeof value !== 'string' || hasControlCharacters(value)) return null
  const input = value.trim()
  if (
    !input ||
    input.length > 2048 ||
    !/^https?:\/\//i.test(input) ||
    hasControlCharacters(input, true) ||
    input.includes('\\')
  ) {
    return null
  }

  try {
    const url = new URL(input)
    const authority = input.match(/^https?:\/\/([^/?#]*)/i)?.[1] ?? ''
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password ||
      authority.includes('@') ||
      url.href.length > 2048
    ) {
      return null
    }
    return url.href
  } catch {
    return null
  }
}

export function parseProjectPresentation(value: unknown): ExternalWebDemo | null {
  if (!isRecord(value) || value.kind !== 'external-web-demo') return null
  if (typeof value.id !== 'string' || typeof value.title !== 'string') return null
  const id = value.id.trim()
  const title = value.title.trim()
  const url = normalizePresentationUrl(value.url)
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(id) ||
    !title ||
    title.length > 200 ||
    hasControlCharacters(value.title) ||
    !url
  ) {
    return null
  }
  return { kind: 'external-web-demo', id, title, url }
}

function readPresentations(metadata: unknown): unknown[] {
  if (!isRecord(metadata) || !isRecord(metadata.vilhil)) return []
  return Array.isArray(metadata.vilhil.presentations) ? metadata.vilhil.presentations : []
}

/** Read only the first valid resource; metadata never grants project access. */
export function getPresentationFromSiteMetadata(metadata: unknown): ExternalWebDemo | null {
  for (const value of readPresentations(metadata)) {
    const presentation = parseProjectPresentation(value)
    if (presentation) return presentation
  }
  return null
}

/** Match the list API's first valid root Site, without loading or changing a scene. */
export function getProjectPresentation(snapshot: unknown): ExternalWebDemo | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.nodes) || !Array.isArray(snapshot.rootNodeIds)) {
    return null
  }
  const nodes = snapshot.nodes
  for (const id of snapshot.rootNodeIds) {
    if (typeof id !== 'string' || !Object.hasOwn(nodes, id)) continue
    const node = nodes[id]
    if (!isRecord(node) || node.type !== 'site' || node.id !== id || node.parentId != null) continue
    return getPresentationFromSiteMetadata(node.metadata)
  }
  return null
}
