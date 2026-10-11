import type { GameCardData } from "@workspace/ui/lib/game/theme"

const image = (path: string) =>
  `https://upload.wikimedia.org/wikipedia/commons/thumb/${path}`

// Static demo cards until the animal catalog and game loop exist.
export const CARDS = [
  {
    id: "bengal-tiger",
    name: "Bengal tiger",
    subtitle: "Panthera tigris tigris",
    imageUrl: image(
      "8/84/Bengal_tiger_in_Sanjay_Dubri_Tiger_Reserve_December_2024_by_Tisha_Mukherjee_11.jpg/960px-Bengal_tiger_in_Sanjay_Dubri_Tiger_Reserve_December_2024_by_Tisha_Mukherjee_11.jpg"
    ),
    stat: "Big cat",
    rarity: "legendary",
  },
  {
    id: "snow-leopard",
    name: "Snow leopard",
    subtitle: "Panthera uncia",
    imageUrl: image("a/a5/Irbis4.JPG/960px-Irbis4.JPG"),
    stat: "Mountain cat",
    rarity: "epic",
  },
  {
    id: "red-panda",
    name: "Red panda",
    subtitle: "Ailurus fulgens",
    imageUrl: image(
      "f/fd/Red_Panda%2C_Gentle_Tree-Dweller_of_the_Himalayas.jpg/960px-Red_Panda%2C_Gentle_Tree-Dweller_of_the_Himalayas.jpg"
    ),
    stat: "Tree climber",
    rarity: "rare",
  },
  {
    id: "axolotl",
    name: "Axolotl",
    subtitle: "Ambystoma mexicanum",
    imageUrl: image("0/00/Axolotl_ganz.jpg/960px-Axolotl_ganz.jpg"),
    stat: "Amphibian",
    rarity: "rare",
  },
  {
    id: "fennec-fox",
    name: "Fennec fox",
    subtitle: "Vulpes zerda",
    imageUrl: image(
      "9/9f/Fennec_Fox_Vulpes_zerda.jpg/960px-Fennec_Fox_Vulpes_zerda.jpg"
    ),
    stat: "Desert fox",
    rarity: "common",
  },
  {
    id: "komodo-dragon",
    name: "Komodo dragon",
    subtitle: "Varanus komodoensis",
    imageUrl: image(
      "f/f5/202306_Varanus_komodoensis.jpg/960px-202306_Varanus_komodoensis.jpg"
    ),
    stat: "Reptile",
    rarity: "epic",
  },
  {
    id: "bald-eagle",
    name: "Bald eagle",
    subtitle: "Haliaeetus leucocephalus",
    imageUrl: image(
      "d/db/Bald_eagle_about_to_fly_in_Alaska_%282016%29.jpg/960px-Bald_eagle_about_to_fly_in_Alaska_%282016%29.jpg"
    ),
    stat: "Bird of prey",
    rarity: "rare",
  },
  {
    id: "arctic-fox",
    name: "Arctic fox",
    subtitle: "Vulpes lagopus",
    imageUrl: image(
      "d/dc/Vulpes_lagopus_in_Iceland_%28cropped_3%29.jpg/960px-Vulpes_lagopus_in_Iceland_%28cropped_3%29.jpg"
    ),
    stat: "Polar mammal",
    rarity: "common",
  },
] as const satisfies ReadonlyArray<GameCardData>

export const COLLECTION = CARDS.map((card, index) => ({
  ...card,
  copies: index % 5 === 1 ? 2 : 1,
  pulledOn: `2026-10-${String(11 - (index % 7)).padStart(2, "0")}`,
}))

export type CollectedCard = (typeof COLLECTION)[number]

export const PACK_IMAGES = CARDS.slice(0, 4).map((card) => card.imageUrl)

// Rarest last, so the reveal builds up like a real pack.
export const DEMO_PACK = [
  { ...CARDS[7], isNew: false },
  { ...CARDS[4], isNew: true },
  { ...CARDS[3], isNew: true },
  { ...CARDS[5], isNew: true },
  { ...CARDS[0], isNew: false },
]

export const PLAYER = {
  name: "Léo",
  level: 1,
  owned: COLLECTION.length,
  total: CARDS.length,
  packs: 1,
  streak: "1d",
}
