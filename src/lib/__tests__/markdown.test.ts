import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownRenderer } from '../../components/MarkdownRenderer'
import React from 'react'

/** Helper: render markdown to HTML string for assertions */
function md(content: string): string {
  return renderToStaticMarkup(React.createElement(MarkdownRenderer, { content }))
}

// ─── Table ────────────────────────────────────────────────────────────────────

describe('Table', () => {
  it('renders 2-col table with thead and tbody', () => {
    const input = `| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |`
    const html = md(input)
    expect(html).toContain('<table')
    expect(html).toContain('<thead')
    expect(html).toContain('<tbody')
    expect(html).toContain('<th')
    expect(html).toContain('Name')
    expect(html).toContain('Age')
    expect(html).toContain('<td')
    expect(html).toContain('Alice')
    expect(html).toContain('30')
    expect(html).toContain('Bob')
    expect(html).toContain('25')
  })

  it('header row is in thead, body rows in tbody', () => {
    const input = `| A | B |\n| - | - |\n| 1 | 2 |`
    const html = md(input)
    // thead must come before tbody
    const theadIdx = html.indexOf('<thead')
    const tbodyIdx = html.indexOf('<tbody')
    expect(theadIdx).toBeLessThan(tbodyIdx)
    // A and B are in thead
    const theadSection = html.slice(theadIdx, tbodyIdx)
    expect(theadSection).toContain('A')
    expect(theadSection).toContain('B')
    // 1 and 2 are in tbody
    const tbodySection = html.slice(tbodyIdx)
    expect(tbodySection).toContain('1')
    expect(tbodySection).toContain('2')
  })
})

// ─── Strikethrough ────────────────────────────────────────────────────────────

describe('Strikethrough', () => {
  it('renders ~~text~~ as <del>', () => {
    const html = md('~~deleted~~')
    expect(html).toContain('<del>deleted</del>')
  })

  it('renders strikethrough inline within paragraph', () => {
    const html = md('before ~~strike~~ after')
    expect(html).toContain('<del>strike</del>')
    expect(html).toContain('before')
    expect(html).toContain('after')
  })
})

// ─── Nested unordered list ────────────────────────────────────────────────────

describe('Nested unordered list', () => {
  it('renders 2-level nested ul', () => {
    const input = `- parent\n  - child`
    const html = md(input)
    // Two <ul> elements
    const ulCount = (html.match(/<ul/g) ?? []).length
    expect(ulCount).toBe(2)
    // parent li contains child ul
    expect(html).toContain('parent')
    expect(html).toContain('child')
  })

  it('nested list is inside parent li', () => {
    const input = `- alpha\n  - beta\n  - gamma\n- delta`
    const html = md(input)
    // The nested <ul> appears between parent li content
    const alphaIdx = html.indexOf('alpha')
    const betaIdx = html.indexOf('beta')
    const gammaIdx = html.indexOf('gamma')
    const deltaIdx = html.indexOf('delta')
    expect(alphaIdx).toBeLessThan(betaIdx)
    expect(betaIdx).toBeLessThan(gammaIdx)
    expect(gammaIdx).toBeLessThan(deltaIdx)
  })
})

// ─── Multi-paragraph blockquote ──────────────────────────────────────────────

describe('Multi-paragraph blockquote', () => {
  it('groups consecutive > lines into one blockquote', () => {
    const input = `> line one\n> line two`
    const html = md(input)
    const bqCount = (html.match(/<blockquote/g) ?? []).length
    expect(bqCount).toBe(1)
  })

  it('blank > line creates separate <p> inside blockquote', () => {
    const input = `> first paragraph\n>\n> second paragraph`
    const html = md(input)
    // Still one blockquote
    const bqCount = (html.match(/<blockquote/g) ?? []).length
    expect(bqCount).toBe(1)
    // Two <p> elements inside
    expect(html).toContain('first paragraph')
    expect(html).toContain('second paragraph')
    const pCount = (html.match(/<p/g) ?? []).length
    expect(pCount).toBeGreaterThanOrEqual(2)
  })
})

// ─── Setext headings ──────────────────────────────────────────────────────────

describe('Setext headings', () => {
  it('line followed by === renders as h1', () => {
    const input = `My Title\n========`
    const html = md(input)
    expect(html).toContain('<h1')
    expect(html).toContain('My Title')
  })

  it('line followed by --- renders as h2', () => {
    const input = `Sub Heading\n-----------`
    const html = md(input)
    expect(html).toContain('<h2')
    expect(html).toContain('Sub Heading')
  })
})

// ─── Indented code block ──────────────────────────────────────────────────────

describe('Indented code block', () => {
  it('4-space indent renders as <pre><code>', () => {
    const input = `    const x = 1\n    const y = 2`
    const html = md(input)
    expect(html).toContain('<pre')
    expect(html).toContain('<code>')
    expect(html).toContain('const x = 1')
    expect(html).toContain('const y = 2')
  })

  it('tab indent renders as <pre><code>', () => {
    const input = `\techo hello`
    const html = md(input)
    expect(html).toContain('<pre')
    expect(html).toContain('echo hello')
  })
})

// ─── Inline code in list item ─────────────────────────────────────────────────

describe('Inline code in list item', () => {
  it('renders `code` inside list item', () => {
    const input = `- use \`npm install\` to install`
    const html = md(input)
    expect(html).toContain('<code')
    expect(html).toContain('npm install')
    expect(html).toContain('<li')
  })

  it('inline code works in nested list item', () => {
    const input = `- parent\n  - run \`yarn dev\``
    const html = md(input)
    expect(html).toContain('<code')
    expect(html).toContain('yarn dev')
  })
})

// ─── Bold + italic + link combo ───────────────────────────────────────────────

describe('Inline combo: bold + italic + link', () => {
  it('renders **bold**, *italic*, and [link](url) in one paragraph', () => {
    const input = `**bold** and *italic* and [click here](https://example.com)`
    const html = md(input)
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('<a')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('click here')
  })

  it('safeHref blocks javascript: links', () => {
    // eslint-disable-next-line no-script-url
    const input = `[evil](javascript:alert(1))`
    const html = md(input)
    expect(html).toContain('href="#"')
    expect(html).not.toContain('javascript:')
  })
})
