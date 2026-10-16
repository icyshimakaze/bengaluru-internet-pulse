export const neighborhoods = ["Whitefield", "Indiranagar", "Koramangala", "Hebbal", "Electronic City", "Yelahanka", "Jayanagar", "Marathahalli", "HSR Layout", "MG Road"] as const;
// Curated approximate neighborhood centers, never incident coordinates or geocoded source locations.
export const coordinates: Readonly<Record<(typeof neighborhoods)[number], readonly [number, number]>> = {
  Whitefield: [12.9698, 77.7500], Indiranagar: [12.9784, 77.6408], Koramangala: [12.9352, 77.6245],
  Hebbal: [13.0354, 77.5988], "Electronic City": [12.8452, 77.6602], Yelahanka: [13.1005, 77.5963],
  Jayanagar: [12.9250, 77.5938], Marathahalli: [12.9591, 77.6974], "HSR Layout": [12.9116, 77.6389], "MG Road": [12.9756, 77.6066],
};
