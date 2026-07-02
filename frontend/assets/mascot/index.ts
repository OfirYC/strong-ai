// Auto-maintained mascot asset map.
// React Native bundles assets via static require(), so every variant is listed explicitly.
// Filenames: {gender}_{body}_{state}.png  — produced by build_assets.sh (transparent, 600px).

export type MascotGender = "m" | "f";
export type MascotState =
  | "idle" | "wave" | "cheer" | "think" | "proud" | "curl" | "run" | "lift";
// Male bodies: lean | soft | skinny | muscular   ·   Female bodies: lean | soft | skinny | after
export type MascotBody = "lean" | "soft" | "skinny" | "muscular" | "after";

const MASCOTS: Record<string, number> = {
  // ── Male · lean (hero) ──
  m_lean_idle: require("./m_lean_idle.png"),
  m_lean_wave: require("./m_lean_wave.png"),
  m_lean_cheer: require("./m_lean_cheer.png"),
  m_lean_think: require("./m_lean_think.png"),
  m_lean_proud: require("./m_lean_proud.png"),
  m_lean_curl: require("./m_lean_curl.png"),
  m_lean_run: require("./m_lean_run.png"),
  m_lean_lift: require("./m_lean_lift.png"),
  // ── Male · soft ──
  m_soft_idle: require("./m_soft_idle.png"),
  m_soft_wave: require("./m_soft_wave.png"),
  m_soft_cheer: require("./m_soft_cheer.png"),
  m_soft_think: require("./m_soft_think.png"),
  m_soft_proud: require("./m_soft_proud.png"),
  m_soft_curl: require("./m_soft_curl.png"),
  m_soft_run: require("./m_soft_run.png"),
  m_soft_lift: require("./m_soft_lift.png"),
  // ── Male · skinny ──
  m_skinny_idle: require("./m_skinny_idle.png"),
  m_skinny_wave: require("./m_skinny_wave.png"),
  m_skinny_cheer: require("./m_skinny_cheer.png"),
  m_skinny_think: require("./m_skinny_think.png"),
  m_skinny_proud: require("./m_skinny_proud.png"),
  m_skinny_curl: require("./m_skinny_curl.png"),
  m_skinny_run: require("./m_skinny_run.png"),
  m_skinny_lift: require("./m_skinny_lift.png"),
  // ── Male · muscular ──
  m_muscular_idle: require("./m_muscular_idle.png"),
  m_muscular_wave: require("./m_muscular_wave.png"),
  m_muscular_cheer: require("./m_muscular_cheer.png"),
  m_muscular_think: require("./m_muscular_think.png"),
  m_muscular_proud: require("./m_muscular_proud.png"),
  m_muscular_curl: require("./m_muscular_curl.png"),
  m_muscular_run: require("./m_muscular_run.png"),
  m_muscular_lift: require("./m_muscular_lift.png"),

  // ── Female · lean (hero) ──
  f_lean_idle: require("./f_lean_idle.png"),
  f_lean_wave: require("./f_lean_wave.png"),
  f_lean_cheer: require("./f_lean_cheer.png"),
  f_lean_think: require("./f_lean_think.png"),
  f_lean_proud: require("./f_lean_proud.png"),
  f_lean_curl: require("./f_lean_curl.png"),
  f_lean_run: require("./f_lean_run.png"),
  f_lean_lift: require("./f_lean_lift.png"),
  // ── Female · soft ──
  f_soft_idle: require("./f_soft_idle.png"),
  f_soft_wave: require("./f_soft_wave.png"),
  f_soft_cheer: require("./f_soft_cheer.png"),
  f_soft_think: require("./f_soft_think.png"),
  f_soft_proud: require("./f_soft_proud.png"),
  f_soft_curl: require("./f_soft_curl.png"),
  f_soft_run: require("./f_soft_run.png"),
  f_soft_lift: require("./f_soft_lift.png"),
  // ── Female · skinny ──
  f_skinny_idle: require("./f_skinny_idle.png"),
  f_skinny_wave: require("./f_skinny_wave.png"),
  f_skinny_cheer: require("./f_skinny_cheer.png"),
  f_skinny_think: require("./f_skinny_think.png"),
  f_skinny_proud: require("./f_skinny_proud.png"),
  f_skinny_curl: require("./f_skinny_curl.png"),
  f_skinny_run: require("./f_skinny_run.png"),
  f_skinny_lift: require("./f_skinny_lift.png"),
  // ── Female · after (strong) ──
  f_after_idle: require("./f_after_idle.png"),
  f_after_wave: require("./f_after_wave.png"),
  f_after_cheer: require("./f_after_cheer.png"),
  f_after_think: require("./f_after_think.png"),
  f_after_proud: require("./f_after_proud.png"),
  f_after_curl: require("./f_after_curl.png"),
  f_after_run: require("./f_after_run.png"),
  f_after_lift: require("./f_after_lift.png"),
};

/** Resolve a mascot asset; falls back to the lean hero idle of that gender if a variant is missing. */
export function mascotSource(
  gender: MascotGender,
  body: MascotBody,
  state: MascotState,
): number {
  return (
    MASCOTS[`${gender}_${body}_${state}`] ??
    MASCOTS[`${gender}_lean_${state}`] ??
    MASCOTS[`${gender}_lean_idle`]
  );
}

export default MASCOTS;
