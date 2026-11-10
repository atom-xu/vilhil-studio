import { describe, expect, test } from 'bun:test'
import {
  getPresentationFromSiteMetadata,
  getProjectPresentation,
  normalizePresentationUrl,
  parseProjectPresentation,
} from '../apps/editor/lib/project-presentations'

const demo = (overrides: Record<string, unknown> = {}) => ({
  kind: 'external-web-demo',
  id: 'sample-demo',
  title: '示例演示',
  url: 'https://example.org/demo/',
  ...overrides,
})
const metadata = (presentations: unknown) => ({ vilhil: { presentations } })
const rootSite = (id: string, presentations: unknown) => ({
  id,
  type: 'site',
  parentId: null,
  metadata: metadata(presentations),
})

describe('Given an existing project web demo', () => {
  test('When its URL is absolute HTTP(S), Then normalize it while preserving query and fragment', () => {
    expect(normalizePresentationUrl('  HTTPS://EXAMPLE.ORG:443/demo?q=a%40b#room  ')).toBe(
      'https://example.org/demo?q=a%40b#room',
    )
    expect(normalizePresentationUrl('http://localhost:3002/demo')).toBe(
      'http://localhost:3002/demo',
    )
  })

  test('When its URL is executable, relative, malformed or contains userinfo, Then reject it', () => {
    for (const url of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///tmp/demo.html',
      '//example.org/demo',
      '/demo',
      'https:example.org',
      'https://',
      'https://user:password@example.org/demo',
      'https://user%40example.org@other.example/demo',
      'https://@example.org/demo',
      'https://example.org/has a space',
      'https://example.org/line\nbreak',
      'https://example.org\\@other.example/demo',
      `https://example.org/${'x'.repeat(2048)}`,
      null,
      42,
    ])
      expect(normalizePresentationUrl(url)).toBeNull()
  })

  test('When resource fields are missing or invalid, Then skip the entry', () => {
    for (const value of [
      demo({ id: '' }),
      demo({ id: '../path' }),
      demo({ id: 'x'.repeat(101) }),
      demo({ title: '' }),
      demo({ title: 'a\nb' }),
      demo({ title: 'x'.repeat(201) }),
      demo({ kind: 'script' }),
    ])
      expect(parseProjectPresentation(value)).toBeNull()
  })

  test('When entries repeat or are damaged, Then use only the first valid demo without mutation', () => {
    const value = metadata([
      null,
      demo({ url: 'javascript:alert(1)' }),
      demo(),
      demo({ id: 'later' }),
    ])
    const before = JSON.stringify(value)
    expect(getPresentationFromSiteMetadata(value)).toEqual(demo())
    expect(JSON.stringify(value)).toBe(before)
    expect(getPresentationFromSiteMetadata(metadata(new Array(150_000).fill(null)))).toBeNull()
  })

  test('When root entries are invalid, Then select the first valid root Site only', () => {
    const snapshot = {
      nodes: {
        building_sample: {
          id: 'building_sample',
          type: 'building',
          parentId: null,
          metadata: metadata([demo({ id: 'building' })]),
        },
        site_child: {
          ...rootSite('site_child', [demo({ id: 'child' })]),
          parentId: 'building_sample',
        },
        site_first: rootSite('site_first', [demo()]),
        site_second: rootSite('site_second', [demo({ id: 'second' })]),
      },
      rootNodeIds: ['missing', 'building_sample', 'site_child', 'site_first', 'site_second'],
    }
    expect(getProjectPresentation(snapshot)).toEqual(demo())
    expect(
      getProjectPresentation({
        ...snapshot,
        nodes: { ...snapshot.nodes, site_first: rootSite('site_first', []) },
      }),
    ).toBeNull()
  })

  test('When the snapshot or metadata is malformed, Then return no demo and grant no access', () => {
    for (const value of [
      null,
      [],
      {},
      { nodes: {} },
      { ownerId: 'claimed-owner', isPublic: true, presentations: [demo()] },
    ]) {
      expect(getProjectPresentation(value)).toBeNull()
      expect(getPresentationFromSiteMetadata(value)).toBeNull()
    }
    expect(
      getProjectPresentation({
        nodes: { site_sample: rootSite('wrong-id', [demo()]) },
        rootNodeIds: ['site_sample'],
      }),
    ).toBeNull()
    expect(
      getProjectPresentation({
        nodes: { site_sample: rootSite('site_sample', [demo()]) },
        rootNodeIds: [],
      }),
    ).toBeNull()
  })
})
