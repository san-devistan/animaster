const creditPattern =
  /^(feat\.?|ft\.?|featuring|with|w\/|con|prod\.?|part\.|participação)\s|\b(feat\.?|ft\.?|featuring)\s/i
// Live recordings, remixes, edits, remasters and re-recordings are shown under the song's plain title.
const editionPattern =
  /\b(re-?master(ed)?|\d{4} (master|mix)|radio edit|single version|original version|album version|mono|stereo|from\b|bonus track|live|ao vivo|en vivo|remix|rmx|taylor.s version)\b/i
const yearPattern = /^\d{4}$/
const variantPattern = /\b(remix|version|edit|mix)\b/i

function isIgnoredSuffix(suffix: string) {
  const trimmed = suffix.trim()
  return (
    creditPattern.test(trimmed) ||
    editionPattern.test(trimmed) ||
    yearPattern.test(trimmed)
  )
}

export function displayTitle(title: string) {
  return title
    .replace(/\s*[([]([^)\]]*)[)\]]/g, (match, inner: string) =>
      isIgnoredSuffix(inner) ? "" : match
    )
    .replace(/\s+-\s+(.*)$/, (match, suffix: string) =>
      isIgnoredSuffix(suffix) ? "" : match
    )
    .replace(/\s+(feat\.?|ft\.?|featuring)\s[^()[\]]*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim()
}

function canonicalTitle(title: string) {
  return displayTitle(title)
    .replace(/\s*[([]([^)\]]*)[)\]]/g, (match, inner: string) =>
      variantPattern.test(inner) ? "" : match
    )
    .replace(/\s+-\s+(.*)$/, (match, suffix: string) =>
      variantPattern.test(suffix) ? "" : match
    )
    .trim()
}

export function normalizeText(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

export function songKey(title: string, leadArtistId: string) {
  return `${leadArtistId}:${normalizeText(canonicalTitle(title))}`
}
