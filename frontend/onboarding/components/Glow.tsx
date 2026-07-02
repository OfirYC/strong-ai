import React from "react";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { ob } from "../theme";

type Props = {
  size: number;
  id: string; // must be unique per instance (SVG <Defs> ids are global)
  color?: string;
  intensity?: number;
};

/** Soft radial glow that fades to fully transparent at the edge — atmosphere behind the mascot. */
export default function Glow({
  size,
  id,
  color = ob.primaryGlow,
  intensity = 0.5,
}: Props) {
  return (
    <Svg width={size} height={size} pointerEvents="none">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={color} stopOpacity={intensity} />
          <Stop offset="55%" stopColor={color} stopOpacity={intensity * 0.35} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
}
