export const photoUrl = (url: string) =>
  `/api/photo?url=${encodeURIComponent(url)}`

export const withPhoto = <Card extends { imageUrl: string }>(card: Card) => ({
  ...card,
  imageUrl: photoUrl(card.imageUrl),
})
