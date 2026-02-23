import React, { memo, useEffect, useRef, useState } from "react";
import { Animated, View } from "react-native";
import Markdown from "react-native-markdown-display";

interface AnimatedMarkdownProps {
  content: string;
  isStreaming: boolean;
  markdownStyles: Record<string, any>;
}

interface WordNode {
  word: string;
  key: number;
  opacity: Animated.Value;
}

interface FrozenLineNode {
  text: string;
  key: number;
  opacity: Animated.Value;
}

// Only prevents re-renders from parent — opacity is animated internally
const FrozenLine = memo(
  ({ text, opacity, markdownStyles }: { text: string; opacity: Animated.Value; markdownStyles: any }) => (
    <Animated.View style={{ opacity }}>
      <Markdown style={markdownStyles}>{text + "\n"}</Markdown>
    </Animated.View>
  ),
  () => true
);

export default function AnimatedMarkdown({
  content,
  isStreaming,
  markdownStyles,
}: AnimatedMarkdownProps) {
  const [frozenLines, setFrozenLines] = useState<FrozenLineNode[]>([]);
  const [activeWords, setActiveWords] = useState<WordNode[]>([]);

  const frozenLineTextsRef = useRef<string[]>([]);
  const activeWordCountRef = useRef(0);
  const lineKeyRef = useRef(0);
  const wordKeyRef = useRef(0);

  useEffect(() => {
    if (!isStreaming) {
      setFrozenLines([]);
      setActiveWords([]);
      frozenLineTextsRef.current = [];
      activeWordCountRef.current = 0;
      return;
    }

    const lines = content.split("\n");
    const completeLines = lines.slice(0, -1);
    const activeLine = lines[lines.length - 1];

    // Freeze newly completed lines — animate them in too
    const newLines = completeLines.slice(frozenLineTextsRef.current.length);
    if (newLines.length > 0) {
      frozenLineTextsRef.current = completeLines;
      activeWordCountRef.current = 0;
      setActiveWords([]);

      setFrozenLines(prev => [
        ...prev,
        ...newLines.map(text => {
          const opacity = new Animated.Value(0);
          Animated.timing(opacity, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }).start();
          return { text, key: lineKeyRef.current++, opacity };
        }),
      ]);
    }

    // Animate new words on the active line
    const allWords = activeLine.match(/\S+|\s+/g) ?? [];
    const newWords = allWords.slice(activeWordCountRef.current);
    if (!newWords.length) return;

    activeWordCountRef.current = allWords.length;

    setActiveWords(prev => [
      ...prev,
      ...newWords.map(word => {
        const opacity = new Animated.Value(0);
        Animated.timing(opacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }).start();
        return { word, key: wordKeyRef.current++, opacity };
      }),
    ]);
  }, [content, isStreaming]);

  if (!isStreaming) {
    return <Markdown style={markdownStyles}>{content}</Markdown>;
  }

  return (
    <View>
      {frozenLines.map(({ text, key, opacity }) => (
        <FrozenLine key={key} text={text} opacity={opacity} markdownStyles={markdownStyles} />
      ))}
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {activeWords.map(({ word, key, opacity }) => (
          <Animated.Text
            key={key}
            style={{
              opacity,
              fontSize: markdownStyles.body?.fontSize ?? 16,
              lineHeight: markdownStyles.body?.lineHeight ?? 22,
              color: markdownStyles.body?.color ?? "#1C1C1E",
            }}
          >
            {word}
          </Animated.Text>
        ))}
      </View>
    </View>
  );
}