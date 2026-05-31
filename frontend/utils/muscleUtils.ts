import type { MuscleLoad } from "../types/gen";

type TreeNode = { slug: string; name: string; children?: TreeNode[] };

const MUSCLE_TREE: TreeNode[] = [
  { slug: "chest", name: "Chest", children: [
    { slug: "pec-major", name: "Pec Major", children: [
      { slug: "pec-major-upper", name: "Upper (Clavicular)" },
      { slug: "pec-major-mid", name: "Mid (Sternal)" },
      { slug: "pec-major-lower", name: "Lower" },
    ]},
    { slug: "pec-minor", name: "Pec Minor" },
  ]},
  { slug: "back", name: "Back", children: [
    { slug: "lats", name: "Lats", children: [
      { slug: "lats-upper", name: "Upper Lats" },
      { slug: "lats-lower", name: "Lower Lats" },
    ]},
    { slug: "traps", name: "Traps", children: [
      { slug: "traps-upper", name: "Upper Traps" },
      { slug: "traps-mid", name: "Mid Traps" },
      { slug: "traps-lower", name: "Lower Traps" },
    ]},
    { slug: "rhomboids", name: "Rhomboids" },
    { slug: "erector-spinae", name: "Erector Spinae", children: [
      { slug: "erector-spinae-upper", name: "Upper" },
      { slug: "erector-spinae-lower", name: "Lower" },
    ]},
    { slug: "teres-major", name: "Teres Major" },
    { slug: "rear-delt", name: "Rear Delt" },
  ]},
  { slug: "shoulders", name: "Shoulders", children: [
    { slug: "deltoid", name: "Deltoid", children: [
      { slug: "deltoid-front", name: "Front Delt (Anterior)" },
      { slug: "deltoid-side", name: "Side Delt (Lateral)" },
      { slug: "deltoid-rear", name: "Rear Delt (Posterior)" },
    ]},
    { slug: "rotator-cuff", name: "Rotator Cuff" },
  ]},
  { slug: "arms", name: "Arms", children: [
    { slug: "biceps", name: "Biceps", children: [
      { slug: "biceps-long-head", name: "Long Head" },
      { slug: "biceps-short-head", name: "Short Head" },
    ]},
    { slug: "brachialis", name: "Brachialis" },
    { slug: "triceps", name: "Triceps", children: [
      { slug: "triceps-long-head", name: "Long Head" },
      { slug: "triceps-lateral-head", name: "Lateral Head" },
      { slug: "triceps-medial-head", name: "Medial Head" },
    ]},
    { slug: "forearms", name: "Forearms", children: [
      { slug: "forearms-flexors", name: "Wrist Flexors" },
      { slug: "forearms-extensors", name: "Wrist Extensors" },
      { slug: "brachioradialis", name: "Brachioradialis" },
    ]},
  ]},
  { slug: "core", name: "Core", children: [
    { slug: "abs", name: "Abs", children: [
      { slug: "abs-upper", name: "Upper Abs" },
      { slug: "abs-lower", name: "Lower Abs" },
    ]},
    { slug: "obliques", name: "Obliques", children: [
      { slug: "obliques-internal", name: "Internal Obliques" },
      { slug: "obliques-external", name: "External Obliques" },
    ]},
    { slug: "transverse-abdominis", name: "Transverse Abdominis" },
    { slug: "serratus-anterior", name: "Serratus Anterior" },
  ]},
  { slug: "legs", name: "Legs", children: [
    { slug: "quads", name: "Quads", children: [
      { slug: "quads-rectus-femoris", name: "Rectus Femoris" },
      { slug: "quads-vastus-lateralis", name: "Vastus Lateralis" },
      { slug: "quads-vastus-medialis", name: "Vastus Medialis (VMO)" },
      { slug: "quads-vastus-intermedius", name: "Vastus Intermedius" },
    ]},
    { slug: "hamstrings", name: "Hamstrings", children: [
      { slug: "hamstrings-biceps-femoris", name: "Biceps Femoris" },
      { slug: "hamstrings-semitendinosus", name: "Semitendinosus" },
      { slug: "hamstrings-semimembranosus", name: "Semimembranosus" },
    ]},
    { slug: "glutes", name: "Glutes", children: [
      { slug: "glutes-maximus", name: "Glute Maximus" },
      { slug: "glutes-medius", name: "Glute Medius" },
      { slug: "glutes-minimus", name: "Glute Minimus" },
    ]},
    { slug: "adductors", name: "Adductors" },
    { slug: "abductors", name: "Abductors" },
    { slug: "hip-flexors", name: "Hip Flexors", children: [
      { slug: "hip-flexors-psoas", name: "Psoas" },
      { slug: "hip-flexors-iliacus", name: "Iliacus" },
      { slug: "hip-flexors-rectus-femoris", name: "Rectus Femoris" },
      { slug: "hip-flexors-tfl", name: "TFL" },
    ]},
    { slug: "deep-hip-rotators", name: "Deep Hip Rotators", children: [
      { slug: "piriformis", name: "Piriformis" },
      { slug: "obturator", name: "Obturator (Int/Ext)" },
      { slug: "gemelli", name: "Gemelli" },
      { slug: "quadratus-femoris", name: "Quadratus Femoris" },
    ]},
    { slug: "calves", name: "Calves", children: [
      { slug: "gastrocnemius", name: "Gastrocnemius", children: [
        { slug: "gastrocnemius-medial", name: "Medial Head" },
        { slug: "gastrocnemius-lateral", name: "Lateral Head" },
      ]},
      { slug: "soleus", name: "Soleus" },
      { slug: "plantaris", name: "Plantaris" },
    ]},
    { slug: "lower-leg", name: "Lower Leg", children: [
      { slug: "tibialis-anterior", name: "Tibialis Anterior" },
      { slug: "tibialis-posterior", name: "Tibialis Posterior" },
      { slug: "peroneals", name: "Peroneals (Fibularis)", children: [
        { slug: "peroneus-longus", name: "Peroneus Longus" },
        { slug: "peroneus-brevis", name: "Peroneus Brevis" },
      ]},
      { slug: "deep-toe-flexors", name: "Deep Toe Flexors", children: [
        { slug: "flexor-digitorum-longus", name: "Flexor Digitorum Longus" },
        { slug: "flexor-hallucis-longus", name: "Flexor Hallucis Longus" },
      ]},
    ]},
    { slug: "foot", name: "Foot", children: [
      { slug: "foot-intrinsics", name: "Foot Intrinsics", children: [
        { slug: "flexor-digitorum-brevis", name: "Flexor Digitorum Brevis" },
        { slug: "abductor-hallucis", name: "Abductor Hallucis" },
        { slug: "adductor-hallucis", name: "Adductor Hallucis" },
        { slug: "plantar-interossei", name: "Plantar Interossei" },
      ]},
      { slug: "plantar-fascia", name: "Plantar Fascia" },
    ]},
  ]},
  { slug: "neck", name: "Neck", children: [
    { slug: "sternocleidomastoid", name: "Sternocleidomastoid" },
    { slug: "levator-scapulae", name: "Levator Scapulae" },
    { slug: "neck-extensors", name: "Neck Extensors (Suboccipitals)" },
  ]},
];

// slug → top-level group slug (e.g. "pec-major-upper" → "chest")
function buildSlugToGroup(nodes: TreeNode[], topSlug?: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const node of nodes) {
    const group = topSlug ?? node.slug;
    map[node.slug] = group;
    if (node.children) Object.assign(map, buildSlugToGroup(node.children, group));
  }
  return map;
}

export const SLUG_TO_GROUP: Record<string, string> = buildSlugToGroup(MUSCLE_TREE);

// Top-level group slug → display name
export const GROUP_DISPLAY: Record<string, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  arms: "Arms",
  core: "Core",
  legs: "Legs",
  neck: "Neck",
};

// Filter labels for the exercises screen
export const MUSCLE_FILTER_GROUPS = ["All", "Chest", "Back", "Shoulders", "Arms", "Core", "Legs", "Neck"];

// Derive unique top-level group display names from an exercise's muscle_loads
export function getGroupsFromLoads(muscle_loads?: MuscleLoad[]): string[] {
  if (!muscle_loads?.length) return [];
  const seen = new Set<string>();
  for (const ml of muscle_loads) {
    const group = SLUG_TO_GROUP[ml.slug];
    if (group && GROUP_DISPLAY[group]) seen.add(GROUP_DISPLAY[group]);
  }
  return Array.from(seen);
}

// Check if an exercise's muscle_loads belong to a given filter group name
export function matchesGroup(muscle_loads?: MuscleLoad[], groupName?: string): boolean {
  if (!groupName || groupName === "All") return true;
  const groupSlug = Object.entries(GROUP_DISPLAY).find(([, name]) => name === groupName)?.[0];
  if (!groupSlug) return false;
  return muscle_loads?.some(ml => SLUG_TO_GROUP[ml.slug] === groupSlug) ?? false;
}
