export type RankConfig = {
  id: number;
  name: string;
  emoji: string;
  minGave: number;
  maxGave: number | null;
  minReceived: number;
  maxReceived: number | null;
  tagline: string;
  color: number;
};

export type RankProgress = {
  currentRank: RankConfig | null;
  nextRank: RankConfig | null;
  gaveProgressText: string;
  receivedProgressText: string;
  gaveProgressRatio: number;
  receivedProgressRatio: number;
};

// Rank thresholds are intentionally asymmetrical to reward generous giving.
export const RANKS: RankConfig[] = [
  {
    id: 1,
    name: "Dough Beginner",
    emoji: "🍪",
    minGave: 1,
    maxGave: 4,
    minReceived: 2,
    maxReceived: 5,
    tagline: "Still figuring out the recipe",
    color: 0xd2b48c,
  },
  {
    id: 2,
    name: "Batch Buddy",
    emoji: "🍪🍪",
    minGave: 5,
    maxGave: 12,
    minReceived: 8,
    maxReceived: 18,
    tagline: "Making consistency happen",
    color: 0xcd853f,
  },
  {
    id: 3,
    name: "Oven Master",
    emoji: "🔥",
    minGave: 13,
    maxGave: 30,
    minReceived: 20,
    maxReceived: 45,
    tagline: "Perfectly golden, every time",
    color: 0xff8c00,
  },
  {
    id: 4,
    name: "Choco Connoisseur",
    emoji: "🍫",
    minGave: 31,
    maxGave: 65,
    minReceived: 50,
    maxReceived: 100,
    tagline: "Refined palate, exquisite taste",
    color: 0x8b4513,
  },
  {
    id: 5,
    name: "Sprinkle Spreader",
    emoji: "✨",
    minGave: 66,
    maxGave: 140,
    minReceived: 110,
    maxReceived: 230,
    tagline: "Sparkling joy in every bite",
    color: 0xff69b4,
  },
  {
    id: 6,
    name: "Dunk Dynasty",
    emoji: "☕",
    minGave: 141,
    maxGave: 300,
    minReceived: 240,
    maxReceived: 500,
    tagline: "The perfect dunk, every time",
    color: 0x6f4e37,
  },
  {
    id: 7,
    name: "Crumble Royalty",
    emoji: "👑",
    minGave: 301,
    maxGave: 650,
    minReceived: 520,
    maxReceived: 1100,
    tagline: "Commanding the kitchen domain",
    color: 0xffd700,
  },
  {
    id: 8,
    name: "Cookie Monster",
    emoji: "🍪",
    minGave: 651,
    maxGave: 1400,
    minReceived: 1150,
    maxReceived: 2400,
    tagline: "C is for... Community champion",
    color: 0x1e90ff,
  },
  {
    id: 9,
    name: "Biscuit Baron",
    emoji: "🏰",
    minGave: 1401,
    maxGave: 2800,
    minReceived: 2450,
    maxReceived: 4900,
    tagline: "Rules an empire of appreciation",
    color: 0x483d8b,
  },
  {
    id: 10,
    name: "Pastry Prophet",
    emoji: "🔮",
    minGave: 2801,
    maxGave: 5600,
    minReceived: 5000,
    maxReceived: 10000,
    tagline: "Sees the future of kindness",
    color: 0x9370db,
  },
  {
    id: 11,
    name: "Snickerdoodle Sage",
    emoji: "🧙",
    minGave: 5601,
    maxGave: 11200,
    minReceived: 10100,
    maxReceived: 20200,
    tagline: "Ancient wisdom, cinnamon touched",
    color: 0x8a2be2,
  },
  {
    id: 12,
    name: "Cookie Overlord",
    emoji: "👹",
    minGave: 11201,
    maxGave: null,
    minReceived: 20300,
    maxReceived: null,
    tagline: "The legend itself. The myth. The cookies.",
    color: 0xb22222,
  },
];

export function getRankById(rankId: number | null): RankConfig | null {
  if (rankId === null) {
    return null;
  }

  return RANKS.find((rank) => rank.id === rankId) ?? null;
}

export function resolveRankFromTotals(cookiesGiven: number, cookiesReceived: number): RankConfig | null {
  let currentRank: RankConfig | null = null;

  for (const rank of RANKS) {
    if (cookiesGiven >= rank.minGave && cookiesReceived >= rank.minReceived) {
      currentRank = rank;
    }
  }

  return currentRank;
}

function toRatio(current: number, required: number): number {
  if (required <= 0) {
    return 1;
  }

  return Math.min(current / required, 1);
}

export function getRankProgress(cookiesGiven: number, cookiesReceived: number): RankProgress {
  const currentRank = resolveRankFromTotals(cookiesGiven, cookiesReceived);
  const nextRank = currentRank ? RANKS[currentRank.id] ?? null : RANKS[0] ?? null;

  if (!nextRank) {
    return {
      currentRank,
      nextRank: null,
      gaveProgressText: "Max rank reached",
      receivedProgressText: "Max rank reached",
      gaveProgressRatio: 1,
      receivedProgressRatio: 1,
    };
  }

  if (currentRank && currentRank.id === RANKS.length) {
    return {
      currentRank,
      nextRank: null,
      gaveProgressText: "Max rank reached",
      receivedProgressText: "Max rank reached",
      gaveProgressRatio: 1,
      receivedProgressRatio: 1,
    };
  }

  return {
    currentRank,
    nextRank,
    gaveProgressText: `${cookiesGiven}/${nextRank.minGave}`,
    receivedProgressText: `${cookiesReceived}/${nextRank.minReceived}`,
    gaveProgressRatio: toRatio(cookiesGiven, nextRank.minGave),
    receivedProgressRatio: toRatio(cookiesReceived, nextRank.minReceived),
  };
}
