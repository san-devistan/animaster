// Track tempos run from 0 to 400 BPM; workers crawl them in 1-BPM buckets.
export const lastBpm = 399

type TempoCursor = {
  bpm: number
  bpmStep: number
  toBpm: number
  offset: number
}

// After a page: the next page of the bucket, else the worker's next bucket.
export function nextTempoCursor(
  { bpm, bpmStep, toBpm, offset }: TempoCursor,
  hasMore: boolean,
  pageSize: number
) {
  if (hasMore) {
    return { bpm, offset: offset + pageSize, finished: false }
  }

  const nextBpm = bpm + bpmStep
  return { bpm: nextBpm, offset: 0, finished: nextBpm > toBpm }
}

// A worker that can still add artists: crawling tempo or listing an artist.
export function mayAddArtists(run: {
  phase: "tempo" | "artists"
  artistId: string | null
}) {
  return run.phase === "tempo" || run.artistId !== null
}
