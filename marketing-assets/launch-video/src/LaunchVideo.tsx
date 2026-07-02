import React from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const FONT =
  '"Helvetica Neue", "Inter", -apple-system, BlinkMacSystemFont, Arial, sans-serif';
const BLUE = "#3b82f6";

// ---------- Animated cinematic background (Higgsfield image + Ken Burns) ----------
const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [1.15, 1.32]);
  const ty = interpolate(frame, [0, durationInFrames], [0, -60]);
  return (
    <AbsoluteFill style={{ backgroundColor: "#05070d", overflow: "hidden" }}>
      <Img
        src={staticFile("bg.png")}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translateY(${ty}px)`,
        }}
      />
      {/* darkening + vignette for text legibility */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(120% 80% at 50% 35%, rgba(5,7,13,0.15) 0%, rgba(5,7,13,0.65) 60%, rgba(5,7,13,0.92) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

// ---------- Phone mockup ----------
const Phone: React.FC<{ src: string; local: number; dur: number }> = ({
  src,
  local,
  dur,
}) => {
  const { fps } = useVideoConfig();
  const rise = spring({ frame: local, fps, config: { damping: 200, mass: 0.8 } });
  const enterY = interpolate(rise, [0, 1], [160, 0]);
  const enterScale = interpolate(rise, [0, 1], [0.92, 1]);
  const drift = interpolate(local, [0, dur], [0, -26]);
  const opacity = interpolate(
    local,
    [0, 12, dur - 12, dur],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: `translate(-50%, calc(-44% + ${enterY + drift}px)) scale(${enterScale})`,
        opacity,
        width: 560,
      }}
    >
      <div
        style={{
          borderRadius: 56,
          padding: 12,
          background: "linear-gradient(160deg, #20242c, #0b0d12)",
          boxShadow:
            "0 40px 120px rgba(0,0,0,0.6), 0 0 90px rgba(59,130,246,0.35)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Img
          src={src}
          style={{
            width: "100%",
            display: "block",
            borderRadius: 44,
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        />
      </div>
    </div>
  );
};

// ---------- Caption ----------
const Caption: React.FC<{ line: string; accent: string; local: number }> = ({
  line,
  accent,
  local,
}) => {
  const { fps } = useVideoConfig();
  const s = spring({ frame: local, fps, config: { damping: 200 } });
  const y = interpolate(s, [0, 1], [40, 0]);
  const opacity = interpolate(local, [0, 14], [0, 1], {
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        top: 150,
        left: 0,
        right: 0,
        textAlign: "center",
        padding: "0 80px",
        transform: `translateY(${y}px)`,
        opacity,
      }}
    >
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 76,
          lineHeight: 1.05,
          color: "#fff",
          letterSpacing: -1.5,
          textShadow: "0 4px 30px rgba(0,0,0,0.6)",
        }}
      >
        {line}
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 76,
          lineHeight: 1.1,
          color: BLUE,
          letterSpacing: -1.5,
          textShadow: "0 4px 30px rgba(59,130,246,0.4)",
        }}
      >
        {accent}
      </div>
    </div>
  );
};

const FeatureScene: React.FC<{
  src: string;
  line: string;
  accent: string;
  dur: number;
}> = ({ src, line, accent, dur }) => {
  const local = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Caption line={line} accent={accent} local={local} />
      <Phone src={src} local={local} dur={dur} />
    </AbsoluteFill>
  );
};

// ---------- Intro ----------
const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 12, mass: 0.6 } });
  const iconScale = interpolate(pop, [0, 1], [0.4, 1]);
  const titleY = interpolate(
    spring({ frame: frame - 12, fps, config: { damping: 200 } }),
    [0, 1],
    [50, 0],
  );
  const titleOp = interpolate(frame, [12, 28], [0, 1], {
    extrapolateRight: "clamp",
  });
  const tagOp = interpolate(frame, [24, 40], [0, 1], {
    extrapolateRight: "clamp",
  });
  const outOp = interpolate(frame, [78, 96], [1, 0], {
    extrapolateLeft: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        opacity: outOp,
      }}
    >
      <div
        style={{
          transform: `scale(${iconScale})`,
          borderRadius: 64,
          boxShadow: "0 0 120px rgba(59,130,246,0.6)",
        }}
      >
        <Img src={staticFile("icon.png")} style={{ width: 280, borderRadius: 64 }} />
      </div>
      <div
        style={{
          marginTop: 60,
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 110,
          color: "#fff",
          letterSpacing: -3,
          transform: `translateY(${titleY}px)`,
          opacity: titleOp,
        }}
      >
        Strong AI
      </div>
      <div
        style={{
          marginTop: 8,
          fontFamily: FONT,
          fontWeight: 600,
          fontSize: 46,
          color: BLUE,
          letterSpacing: -0.5,
          opacity: tagOp,
        }}
      >
        Your AI Strength Coach
      </div>
    </AbsoluteFill>
  );
};

// ---------- Outro ----------
const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, mass: 0.6 } });
  const scale = interpolate(pop, [0, 1], [0.6, 1]);
  const op = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", opacity: op }}
    >
      <div style={{ transform: `scale(${scale})`, textAlign: "center" }}>
        <Img
          src={staticFile("icon.png")}
          style={{
            width: 220,
            borderRadius: 52,
            boxShadow: "0 0 100px rgba(59,130,246,0.6)",
          }}
        />
        <div
          style={{
            marginTop: 50,
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 96,
            color: "#fff",
            letterSpacing: -2.5,
          }}
        >
          Train Smarter.
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 96,
            color: BLUE,
            letterSpacing: -2.5,
            lineHeight: 1,
          }}
        >
          Get Stronger.
        </div>
        <div
          style={{
            marginTop: 44,
            fontFamily: FONT,
            fontWeight: 600,
            fontSize: 40,
            color: "rgba(255,255,255,0.85)",
          }}
        >
          Download Strong AI today
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- Main ----------
const SCENE = 82;
const INTRO = 96;

const scenes = [
  { src: "shots/home.jpg", line: "Plan your", accent: "perfect workout" },
  { src: "shots/coach.jpg", line: "An AI coach that knows", accent: "your history" },
  { src: "shots/pr.jpg", line: "Track every rep", accent: "& every PR" },
  { src: "shots/routines.jpg", line: "Build routines", accent: "that actually work" },
  { src: "shots/muscles.jpg", line: "See your", accent: "real progress" },
];

export const LaunchVideo: React.FC = () => {
  return (
    <AbsoluteFill>
      <Background />
      <Sequence durationInFrames={INTRO}>
        <Intro />
      </Sequence>
      {scenes.map((s, i) => (
        <Sequence
          key={s.src}
          from={INTRO + i * SCENE}
          durationInFrames={SCENE}
        >
          <FeatureScene src={staticFile(s.src)} line={s.line} accent={s.accent} dur={SCENE} />
        </Sequence>
      ))}
      <Sequence from={INTRO + scenes.length * SCENE} durationInFrames={94}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
};
