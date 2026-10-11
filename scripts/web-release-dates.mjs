// Checks song release dates with Claude (Sonnet by default): from its own knowledge when sure, otherwise with a web search.
// Run: node scripts/web-release-dates.mjs [max songs, default 20] [--save] [--shard=k/n] [--model=claude-opus-5-5] [--nulls]
// Several runs at once: give each one a different --shard=0/4 ... --shard=3/4 so they never take the same song.
// --nulls retries the songs left with reviewed: null instead of the reviewed: false ones.
// Uses the Claude proxy from ~/.zshrc (ANTHROPIC_FOUNDRY_BASE_URL, ANTHROPIC_FOUNDRY_API_KEY).
// Takes songs with reviewed: false, 4 at a time, and stores the date found in webDate. Then:
// - date found: releaseDate = webDate (the model wins any mismatch), reviewed: true
// - no date found: releaseDate unchanged, reviewed: null, to check by hand (releases:toReview, releases:setDates).
// Without --save it is a dry run over at most 50 songs. Songs that errored stay reviewed: false for the next run
// and are skipped for the rest of this one; a batch where every song errored stops the run.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"

const args = process.argv.slice(2)
const save = args.includes("--save")
const nulls = args.includes("--nulls")
const model =
  args.find((arg) => arg.startsWith("--model="))?.slice(8) ??
  "claude-sonnet-5-5"
const limit = Number(args.find((arg) => /^\d+$/.test(arg)) ?? 20)
const [shard, shards] = (
  args.find((arg) => arg.startsWith("--shard="))?.slice(8) ?? "0/1"
)
  .split("/")
  .map(Number)
const parallel = 4

const shardOf = (songId, count) =>
  [...songId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % count

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Retries rate limits, outages and error bodies, so a failed request is never read as "no date".
const fetchJson = async (url, init) => {
  for (let attempt = 1; ; attempt++) {
    let retry = true
    try {
      const res = await fetch(url, init)
      const body = await res.json()
      if (!res.ok || body.error) {
        retry = res.status === 429 || res.status >= 500 || res.ok
        throw new Error(`${res.status} ${JSON.stringify(body).slice(0, 200)}`)
      }
      return body
    } catch (error) {
      if (attempt === 4 || !retry) throw error
      await sleep(2000 * attempt)
    }
  }
}

const convex = (fn, fnArgs) =>
  JSON.parse(
    execFileSync(
      "pnpm",
      ["exec", "convex", "run", fn, JSON.stringify(fnArgs)],
      {
        cwd: new URL("../packages/backend", import.meta.url),
        encoding: "utf8",
        maxBuffer: 1e8,
      }
    )
  )

const prompt = (
  song
) => `What is the original release date of the song "${song.title}" by ${song.artist}?
I want the first day the song was publicly available in any form: usually its release as a single (often before the album), or the album or EP release if it came out there first. Ignore remasters, reissues, remixes, live and demo versions, and later radio or re-release dates.
If you are sure of the exact day, answer directly. Otherwise search the web, then answer.
If you still can't find the exact day, answer null; never fill a missing month or day with 01.
End your reply with only this JSON: {"date": "YYYY-MM-DD" | null, "source": "memory" | "web"}`

const findDate = async (song) => {
  const body = await fetchJson(
    `${process.env.ANTHROPIC_FOUNDRY_BASE_URL}/v1/messages`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": process.env.ANTHROPIC_FOUNDRY_API_KEY,
      },
      // The API requires max_tokens; 128000 is the Sonnet and Opus 5.5 ceiling, so this adds no script-level cap.
      body: JSON.stringify({
        model,
        max_tokens: 128_000,
        tools: [
          { type: "web_search_20250305", name: "web_search", max_uses: 3 },
        ],
        messages: [{ role: "user", content: prompt(song) }],
      }),
    }
  )
  const text = body.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
  // The JSON comes last; an answer without it is an error (retried next run), not "no date".
  const answer = text.match(/\{\s*"date"[^{}]*\}(?![\s\S]*"date")/)
  if (!answer) throw new Error(`unreadable answer: ${text.slice(-160)}`)
  const { date } = JSON.parse(answer[0])
  const searches = body.usage?.server_tool_use?.web_search_requests ?? 0
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ? date : undefined,
    source: searches ? `web x${searches}` : "memory",
  }
}

// match: same date; changed: Sonnet's date replaces the stored one; nodate: reviewed null, to check by hand.
const decide = (stored, found) => {
  if (!found) return "nodate"
  return found === stored ? "match" : "changed"
}

assert.equal(decide("2016-09-23", "2016-09-23"), "match")
assert.equal(decide("2016-09-21", "2016-09-23"), "changed")
assert.equal(decide(undefined, "2016-09-23"), "changed")
assert.equal(decide("2016-09-21", undefined), "nodate")
assert.ok(shard >= 0 && shard < shards, `bad --shard ${shard}/${shards}`)
assert.equal(shardOf("k57bgnvcbwdyp4wraewtyac0c58fq0g3", 1), 0)
assert.ok(shardOf("k57bgnvcbwdyp4wraewtyac0c58fq0g3", 4) < 4)
assert.ok(
  process.env.ANTHROPIC_FOUNDRY_API_KEY,
  "ANTHROPIC_FOUNDRY_API_KEY is not set"
)

const counts = { match: 0, changed: 0, nodate: 0, error: 0 }

const check = async (song) => {
  try {
    const { date, source } = await findDate(song)
    const status = decide(song.releaseDate, date)
    console.log(
      status.padEnd(7),
      `${song.title} - ${song.artist} | ${song.releaseDate ?? "none"} -> ${date ?? "none"} (${source})`
    )
    counts[status]++
    return {
      songId: song.songId,
      reviewed: date ? true : null,
      webDate: date,
      releaseDate: status === "changed" ? date : undefined,
    }
  } catch (error) {
    counts.error++
    console.log("error  ", `${song.title} - ${song.artist}:`, error.message)
    return undefined
  }
}

// Songs already tried this run: errors stay reviewed: false and no-date songs stay null, so both would come back.
const tried = new Set()
let seen = 0
while (seen < limit) {
  const size = Math.min(50, limit - seen)
  // Other shards' songs and tried songs come back first, so fetch well past them.
  const songs = (
    nulls
      ? convex("releases:toReview", {})
      : convex("releases:unreviewed", {
          limit: Math.min(8000, 2000 + tried.size),
        })
  )
    .filter(
      (song) =>
        shardOf(song.songId, shards) === shard && !tried.has(song.songId)
    )
    .slice(0, size)
  if (!songs.length) break
  seen += songs.length
  for (const song of songs) tried.add(song.songId)
  const queue = [...songs]
  const results = []
  // Each lane takes the next song as soon as it is free, so one slow search doesn't hold the others.
  await Promise.all(
    Array.from({ length: parallel }, async () => {
      while (queue.length) {
        const song = queue.shift()
        const result = await check(song)
        if (result) results.push(result)
      }
    })
  )
  if (!save) break
  if (results.length) convex("releases:saveReviewed", { results })
  console.log(`-- saved ${seen}/${limit}`, counts)
  if (!results.length) break
}
console.log(
  `checked ${seen}: reviewed true ${counts.match + counts.changed}, null ${counts.nodate}, errors ${counts.error}`,
  counts,
  save ? "" : "(dry run, nothing saved)"
)
