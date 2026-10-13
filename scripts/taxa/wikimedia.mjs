// English Wikipedia and Commons API lookups, 50 titles per request and one
// request per second (the API blocks faster clients). Answers are cached as
// JSON lines in CACHE so a rerun only asks for new titles.
import { appendFileSync, createReadStream, existsSync } from "node:fs"
import { join } from "node:path"
import { createInterface } from "node:readline"

import { CACHE, USER_AGENT, sleep } from "./sources.mjs"

const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
const COMMONS_API = "https://commons.wikimedia.org/w/api.php"

// For each English Wikipedia title: the article it lands on (following
// redirects), the section when a redirect points into one, and that
// article's main image and whether it sits in an "Extinct …" category
// (Wikipedia marks extinct breeds there; Wikidata often does not).
export async function loadArticles(titles) {
  const path = join(CACHE, "wikipedia-articles.jsonl")
  const articles = new Map()
  if (existsSync(path)) {
    for await (const line of createInterface({
      input: createReadStream(path),
    })) {
      const entry = JSON.parse(line)
      articles.set(entry.title, entry)
    }
  }
  const missing = [...titles].filter((title) => !articles.has(title))
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50)
    const query = await wikipediaQuery(batch)
    const entries = resolveArticles(batch, query)
    for (const entry of entries) articles.set(entry.title, entry)
    appendFileSync(path, entries.map((e) => `${JSON.stringify(e)}\n`).join(""))
    if ((i / 50) % 100 === 0) {
      console.log(`Wikipedia: ${i + batch.length}/${missing.length} titles`)
    }
    await sleep(1000)
  }
  return articles
}

// Maps each asked title through normalization and redirects to its page.
export function resolveArticles(titles, query) {
  const normalized = new Map(
    (query.normalized ?? []).map((n) => [n.from, n.to])
  )
  const redirects = new Map((query.redirects ?? []).map((r) => [r.from, r]))
  const pages = new Map(query.pages.map((page) => [page.title, page]))
  return titles.map((title) => {
    const asked = normalized.get(title) ?? title
    const redirect = redirects.get(asked)
    const page = pages.get(redirect?.to ?? asked)
    return {
      title,
      article: page && !page.missing ? page.title : undefined,
      section: redirect?.tofragment,
      image: page?.pageimage,
      extinct: (page?.categories ?? []).some((c) =>
        c.title.startsWith("Category:Extinct ")
      ),
    }
  })
}

// Commons categories of each image file name (underscored, as given by the
// Wikipedia page image or a Wikidata image URL), cached like loadArticles.
export async function loadImageCategories(files) {
  const path = join(CACHE, "commons-categories.jsonl")
  const categories = new Map()
  if (existsSync(path)) {
    for await (const line of createInterface({
      input: createReadStream(path),
    })) {
      const { file, cats } = JSON.parse(line)
      categories.set(file, cats)
    }
  }
  const missing = [...files].filter((file) => !categories.has(file))
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50)
    const query = await wikipediaQuery(
      batch.map((file) => `File:${file}`),
      COMMONS_API,
      "prop=categories&cllimit=max&clshow=!hidden"
    )
    const byTitle = new Map(query.pages.map((page) => [page.title, page]))
    const normalized = new Map(
      (query.normalized ?? []).map((n) => [n.from, n.to])
    )
    const entries = batch.map((file) => {
      const page = byTitle.get(normalized.get(`File:${file}`) ?? `File:${file}`)
      const cats = (page?.categories ?? []).map((c) => c.title.slice(9))
      return { file, cats }
    })
    for (const { file, cats } of entries) categories.set(file, cats)
    appendFileSync(path, entries.map((e) => `${JSON.stringify(e)}\n`).join(""))
    if ((i / 50) % 100 === 0) {
      console.log(`Commons: ${i + batch.length}/${missing.length} images`)
    }
    await sleep(1000)
  }
  return categories
}

async function wikipediaQuery(
  titles,
  api = WIKIPEDIA_API,
  props = "prop=pageimages|categories&piprop=name&cllimit=max&clshow=!hidden&redirects=1"
) {
  const url = `${api}?action=query&format=json&formatversion=2&${props}&maxlag=5&titles=${encodeURIComponent(titles.join("|"))}`
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    })
    const text = await response.text()
    if (response.ok && text.startsWith("{")) {
      const json = JSON.parse(text)
      if (json.query) return json.query
    }
    if (attempt === 6) {
      throw new Error(`Wikipedia API failed: ${text.slice(0, 200)}`)
    }
    const retryAfter = Number(response.headers.get("retry-after")) * 1000
    await sleep(Math.max(retryAfter || 0, 5000 * attempt))
  }
}
