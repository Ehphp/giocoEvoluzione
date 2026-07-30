# Audit acceptance — adaptations-exhaustion-best-of-seven-v2

{
  "ruleVersion": "adaptations-exhaustion-best-of-seven-v2",
  "seed": 1592598566,
  "methodology": "Seeded symmetric tournament using only production getLegalBotActions, resolveRound, resolveMatchOutcome and simulateMatch. Mirrored pairings share the same seed. No alternate scoring or transition model.",
  "actions": {
    "USE": 1472,
    "EVOLVE": 504,
    "evolveRate": 0.2550607287449393,
    "pureMaxLevelRecoveries": 0,
    "pureRecoveryRate": 0
  },
  "geneFrequency": {
    "FEROCITY": 0.21153846153846154,
    "ARMOR": 0.2054655870445344,
    "AGILITY": 0.19129554655870445,
    "SENSES": 0.19331983805668015,
    "CAMOUFLAGE": 0.19838056680161945
  },
  "concentration": 0.21153846153846154,
  "matchup": {
    "doubleUseRounds": 582,
    "winnerChanges": 164,
    "lowerEnvironmentalValueWins": 90
  },
  "exhaustion": {
    "averageExhaustedGenesPerPlayerRound": 1.951417004048583,
    "averageFirstRecoveryRound": 5.088235294117647
  },
  "integrity": {
    "illegalActions": 0,
    "deterministicAtSameSeed": true
  },
  "matches": {
    "count": 150,
    "averageDurationRounds": 6.586666666666667,
    "leftWins": 60,
    "rightWins": 60,
    "positionDifference": 0,
    "draws": 30,
    "tiebreaks": 14,
    "endReasons": {
      "DRAW": 30,
      "CLINCH": 64,
      "SCORE": 42,
      "ROUND_VALUE_TIEBREAK": 14
    }
  },
  "policyResults": {
    "random": {
      "wins": 2,
      "draws": 12,
      "losses": 46,
      "actions": 384,
      "evolves": 202,
      "evolveRate": 0.5260416666666666,
      "scoreRate": 0.13333333333333333
    },
    "greedy-immediate-use": {
      "wins": 16,
      "draws": 12,
      "losses": 32,
      "actions": 398,
      "evolves": 52,
      "evolveRate": 0.1306532663316583,
      "scoreRate": 0.36666666666666664
    },
    "evolve-first": {
      "wins": 24,
      "draws": 12,
      "losses": 24,
      "actions": 410,
      "evolves": 120,
      "evolveRate": 0.2926829268292683,
      "scoreRate": 0.5
    },
    "heuristic": {
      "wins": 40,
      "draws": 12,
      "losses": 8,
      "actions": 394,
      "evolves": 54,
      "evolveRate": 0.13705583756345177,
      "scoreRate": 0.7666666666666667
    },
    "lookahead-2": {
      "wins": 38,
      "draws": 12,
      "losses": 10,
      "actions": 390,
      "evolves": 76,
      "evolveRate": 0.19487179487179487,
      "scoreRate": 0.7333333333333333
    }
  },
  "strategicVsGreedy": [
    {
      "strategic": "random",
      "wins": 2,
      "draws": 0,
      "losses": 10,
      "scoreRate": 0.16666666666666666
    },
    {
      "strategic": "evolve-first",
      "wins": 6,
      "draws": 0,
      "losses": 6,
      "scoreRate": 0.5
    },
    {
      "strategic": "heuristic",
      "wins": 12,
      "draws": 0,
      "losses": 0,
      "scoreRate": 1
    },
    {
      "strategic": "lookahead-2",
      "wins": 12,
      "draws": 0,
      "losses": 0,
      "scoreRate": 1
    }
  ],
  "thresholds": {
    "maximumGeneFrequency": true,
    "minimumGeneFrequency": true,
    "evolveRate": true,
    "matchupMaterial": true,
    "strategicBeatsGreedy": true,
    "positionBalanced": true,
    "noIllegalActions": true,
    "deterministic": true
  },
  "accepted": true
}
