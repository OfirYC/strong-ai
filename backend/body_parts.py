"""
body_parts.py — single source of truth for the muscle hierarchy.
Nothing stored in DB. Exercises embed slugs from this tree.

Levels:  0 = group  |  1 = muscle  |  2 = head  (head is optional)
"""

from typing import Optional

MUSCLE_TREE: list[dict] = [
    {
        "slug": "chest",
        "name": "Chest",
        "children": [
            {
                "slug": "pec-major",
                "name": "Pec Major",
                "children": [
                    {"slug": "pec-major-upper", "name": "Upper (Clavicular)"},
                    {"slug": "pec-major-mid", "name": "Mid (Sternal)"},
                    {"slug": "pec-major-lower", "name": "Lower"},
                ],
            },
            {"slug": "pec-minor", "name": "Pec Minor"},
        ],
    },
    {
        "slug": "back",
        "name": "Back",
        "children": [
            {
                "slug": "lats",
                "name": "Lats",
                "children": [
                    {"slug": "lats-upper", "name": "Upper Lats"},
                    {"slug": "lats-lower", "name": "Lower Lats"},
                ],
            },
            {
                "slug": "traps",
                "name": "Traps",
                "children": [
                    {"slug": "traps-upper", "name": "Upper Traps"},
                    {"slug": "traps-mid", "name": "Mid Traps"},
                    {"slug": "traps-lower", "name": "Lower Traps"},
                ],
            },
            {"slug": "rhomboids", "name": "Rhomboids"},
            {
                "slug": "erector-spinae",
                "name": "Erector Spinae",
                "children": [
                    {"slug": "erector-spinae-upper", "name": "Upper"},
                    {"slug": "erector-spinae-lower", "name": "Lower"},
                ],
            },
            {"slug": "teres-major", "name": "Teres Major"},
            {"slug": "rear-delt", "name": "Rear Delt"},
        ],
    },
    {
        "slug": "shoulders",
        "name": "Shoulders",
        "children": [
            {
                "slug": "deltoid",
                "name": "Deltoid",
                "children": [
                    {"slug": "deltoid-front", "name": "Front Delt (Anterior)"},
                    {"slug": "deltoid-side", "name": "Side Delt (Lateral)"},
                    {"slug": "deltoid-rear", "name": "Rear Delt (Posterior)"},
                ],
            },
            {"slug": "rotator-cuff", "name": "Rotator Cuff"},
        ],
    },
    {
        "slug": "arms",
        "name": "Arms",
        "children": [
            {
                "slug": "biceps",
                "name": "Biceps",
                "children": [
                    {"slug": "biceps-long-head", "name": "Long Head"},
                    {"slug": "biceps-short-head", "name": "Short Head"},
                ],
            },
            {"slug": "brachialis", "name": "Brachialis"},
            {
                "slug": "triceps",
                "name": "Triceps",
                "children": [
                    {"slug": "triceps-long-head", "name": "Long Head"},
                    {"slug": "triceps-lateral-head", "name": "Lateral Head"},
                    {"slug": "triceps-medial-head", "name": "Medial Head"},
                ],
            },
            {
                "slug": "forearms",
                "name": "Forearms",
                "children": [
                    {"slug": "forearms-flexors", "name": "Wrist Flexors"},
                    {"slug": "forearms-extensors", "name": "Wrist Extensors"},
                    {"slug": "brachioradialis", "name": "Brachioradialis"},
                ],
            },
        ],
    },
    {
        "slug": "core",
        "name": "Core",
        "children": [
            {
                "slug": "abs",
                "name": "Abs",
                "children": [
                    {"slug": "abs-upper", "name": "Upper Abs"},
                    {"slug": "abs-lower", "name": "Lower Abs"},
                ],
            },
            {
                "slug": "obliques",
                "name": "Obliques",
                "children": [
                    {"slug": "obliques-internal", "name": "Internal Obliques"},
                    {"slug": "obliques-external", "name": "External Obliques"},
                ],
            },
            {"slug": "transverse-abdominis", "name": "Transverse Abdominis"},
            {"slug": "serratus-anterior", "name": "Serratus Anterior"},
        ],
    },
    {
        "slug": "legs",
        "name": "Legs",
        "children": [
            {
                "slug": "quads",
                "name": "Quads",
                "children": [
                    {"slug": "quads-rectus-femoris", "name": "Rectus Femoris"},
                    {"slug": "quads-vastus-lateralis", "name": "Vastus Lateralis"},
                    {"slug": "quads-vastus-medialis", "name": "Vastus Medialis (VMO)"},
                    {"slug": "quads-vastus-intermedius", "name": "Vastus Intermedius"},
                ],
            },
            {
                "slug": "hamstrings",
                "name": "Hamstrings",
                "children": [
                    {"slug": "hamstrings-biceps-femoris", "name": "Biceps Femoris"},
                    {"slug": "hamstrings-semitendinosus", "name": "Semitendinosus"},
                    {"slug": "hamstrings-semimembranosus", "name": "Semimembranosus"},
                ],
            },
            {
                "slug": "glutes",
                "name": "Glutes",
                "children": [
                    {"slug": "glutes-maximus", "name": "Glute Maximus"},
                    {"slug": "glutes-medius", "name": "Glute Medius"},
                    {"slug": "glutes-minimus", "name": "Glute Minimus"},
                ],
            },
            {"slug": "adductors", "name": "Adductors"},
            {"slug": "abductors", "name": "Abductors"},
            {
                "slug": "hip-flexors",
                "name": "Hip Flexors",
                "children": [
                    {"slug": "hip-flexors-psoas", "name": "Psoas"},
                    {"slug": "hip-flexors-iliacus", "name": "Iliacus"},
                    {"slug": "hip-flexors-rectus-femoris", "name": "Rectus Femoris"},
                    {"slug": "hip-flexors-tfl", "name": "TFL"},
                ],
            },
            {
                "slug": "deep-hip-rotators",
                "name": "Deep Hip Rotators",
                "children": [
                    {"slug": "piriformis", "name": "Piriformis"},
                    {"slug": "obturator", "name": "Obturator (Int/Ext)"},
                    {"slug": "gemelli", "name": "Gemelli"},
                    {"slug": "quadratus-femoris", "name": "Quadratus Femoris"},
                ],
            },
            {
                "slug": "calves",
                "name": "Calves",
                "children": [
                    {
                        "slug": "gastrocnemius",
                        "name": "Gastrocnemius",
                        "children": [
                            {"slug": "gastrocnemius-medial", "name": "Medial Head"},
                            {"slug": "gastrocnemius-lateral", "name": "Lateral Head"},
                        ],
                    },
                    {"slug": "soleus", "name": "Soleus"},
                    {"slug": "plantaris", "name": "Plantaris"},
                ],
            },
            {
                "slug": "lower-leg",
                "name": "Lower Leg",
                "children": [
                    {"slug": "tibialis-anterior", "name": "Tibialis Anterior"},
                    {"slug": "tibialis-posterior", "name": "Tibialis Posterior"},
                    {
                        "slug": "peroneals",
                        "name": "Peroneals (Fibularis)",
                        "children": [
                            {"slug": "peroneus-longus", "name": "Peroneus Longus"},
                            {"slug": "peroneus-brevis", "name": "Peroneus Brevis"},
                        ],
                    },
                    {
                        "slug": "deep-toe-flexors",
                        "name": "Deep Toe Flexors",
                        "children": [
                            {
                                "slug": "flexor-digitorum-longus",
                                "name": "Flexor Digitorum Longus",
                            },
                            {
                                "slug": "flexor-hallucis-longus",
                                "name": "Flexor Hallucis Longus",
                            },
                        ],
                    },
                ],
            },
            {
                "slug": "foot",
                "name": "Foot",
                "children": [
                    {
                        "slug": "foot-intrinsics",
                        "name": "Foot Intrinsics",
                        "children": [
                            {
                                "slug": "flexor-digitorum-brevis",
                                "name": "Flexor Digitorum Brevis",
                            },
                            {"slug": "abductor-hallucis", "name": "Abductor Hallucis"},
                            {"slug": "adductor-hallucis", "name": "Adductor Hallucis"},
                            {
                                "slug": "plantar-interossei",
                                "name": "Plantar Interossei",
                            },
                        ],
                    },
                    {"slug": "plantar-fascia", "name": "Plantar Fascia"},
                ],
            },
        ],
    },
    {
        "slug": "neck",
        "name": "Neck",
        "children": [
            {"slug": "sternocleidomastoid", "name": "Sternocleidomastoid"},
            {"slug": "levator-scapulae", "name": "Levator Scapulae"},
            {"slug": "neck-extensors", "name": "Neck Extensors (Suboccipitals)"},
        ],
    },
]


# ---------------------------------------------------------------------------
# Derived lookups — built once at import time
# ---------------------------------------------------------------------------


def _flatten(
    nodes: list, parent_slug: Optional[str] = None, level: int = 0
) -> list[dict]:
    result = []
    for node in nodes:
        result.append(
            {
                "slug": node["slug"],
                "name": node["name"],
                "parent_slug": parent_slug,
                "level": level,
            }
        )
        if "children" in node:
            result.extend(_flatten(node["children"], node["slug"], level + 1))
    return result


MUSCLE_TREE_FLAT: list[dict] = _flatten(MUSCLE_TREE)
MUSCLE_MAP: dict[str, dict] = {n["slug"]: n for n in MUSCLE_TREE_FLAT}
ALL_SLUGS: set[str] = set(MUSCLE_MAP.keys())


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------


def get_ancestors(slug: str) -> list[str]:
    """
    Root-to-parent ancestry.
    "biceps-long-head"        -> ["arms", "biceps"]
    "tibialis-posterior"      -> ["legs", "lower-leg"]
    "flexor-hallucis-longus"  -> ["legs", "lower-leg", "deep-toe-flexors"]
    Use to roll up volume: a head-level set also credits all parent levels.
    """
    ancestors: list[str] = []
    current = MUSCLE_MAP.get(slug)
    while current and current.get("parent_slug"):
        ancestors.insert(0, current["parent_slug"])
        current = MUSCLE_MAP.get(current["parent_slug"])
    return ancestors


def get_children(slug: str) -> list[str]:
    """Direct children slugs only."""
    return [n["slug"] for n in MUSCLE_TREE_FLAT if n.get("parent_slug") == slug]


def get_all_descendants(slug: str) -> list[str]:
    """
    All descendants at any depth.
    get_all_descendants("lower-leg") ->
        ["tibialis-anterior", "tibialis-posterior", "peroneals",
         "peroneus-longus", "peroneus-brevis", "deep-toe-flexors",
         "flexor-digitorum-longus", "flexor-hallucis-longus"]
    """
    result: list[str] = []
    queue = get_children(slug)
    while queue:
        child = queue.pop()
        result.append(child)
        queue.extend(get_children(child))
    return result


def display_name(slug: str) -> str:
    node = MUSCLE_MAP.get(slug)
    return node["name"] if node else slug


# ---------------------------------------------------------------------------
# Sanity check
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    groups = [n for n in MUSCLE_TREE_FLAT if n["level"] == 0]
    muscles = [n for n in MUSCLE_TREE_FLAT if n["level"] == 1]
    heads = [n for n in MUSCLE_TREE_FLAT if n["level"] == 2]
    print(f"Groups:  {len(groups)}")
    print(f"Muscles: {len(muscles)}")
    print(f"Heads:   {len(heads)}")
    print(f"Total:   {len(MUSCLE_TREE_FLAT)}")
    print()
    for g in groups:
        children = get_children(g["slug"])
        print(f"  {g['name']} ({len(children)} muscles)")
        for c in children:
            heads_of = get_children(c)
            suffix = f" -> {[display_name(h) for h in heads_of]}" if heads_of else ""
            print(f"    L- {display_name(c)}{suffix}")
