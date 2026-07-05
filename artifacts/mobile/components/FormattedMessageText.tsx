import React from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

interface FormattedMessageTextProps {
  content: string;
  textStyle: TextStyle;
  boldStyle?: TextStyle;
  bulletColor?: string;
}

type Block = { type: "paragraph"; text: string } | { type: "bullet"; items: string[] };

function parseBlocks(content: string): Block[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraphLines: string[] = [];
  let bulletItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length) {
      blocks.push({ type: "paragraph", text: paragraphLines.join(" ").trim() });
      paragraphLines = [];
    }
  };
  const flushBullets = () => {
    if (bulletItems.length) {
      blocks.push({ type: "bullet", items: bulletItems });
      bulletItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const bulletMatch = line.match(/^[-*•]\s+(.*)/);
    const numberedMatch = line.match(/^\d+[.)]\s+(.*)/);
    if (bulletMatch) {
      flushParagraph();
      bulletItems.push(bulletMatch[1].trim());
      continue;
    }
    if (numberedMatch) {
      flushParagraph();
      bulletItems.push(numberedMatch[1].trim());
      continue;
    }
    if (line === "") {
      flushParagraph();
      flushBullets();
      continue;
    }
    flushBullets();
    paragraphLines.push(line);
  }
  flushParagraph();
  flushBullets();
  return blocks;
}

function renderInline(
  text: string,
  textStyle: TextStyle,
  boldStyle: TextStyle,
  keyPrefix: string,
) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((part) => part.length > 0);
  return parts.map((part, i) => {
    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      return (
        <Text key={`${keyPrefix}-${i}`} style={[textStyle, boldStyle]}>
          {boldMatch[1]}
        </Text>
      );
    }
    return (
      <Text key={`${keyPrefix}-${i}`} style={textStyle}>
        {part}
      </Text>
    );
  });
}

export default function FormattedMessageText({
  content,
  textStyle,
  boldStyle,
  bulletColor,
}: FormattedMessageTextProps) {
  const blocks = React.useMemo(() => parseBlocks(content), [content]);
  const resolvedBoldStyle = boldStyle ?? { fontWeight: "700" as const };
  const resolvedBulletColor = bulletColor ?? (textStyle.color as string | undefined);

  return (
    <View style={styles.container}>
      {blocks.map((block, blockIndex) => {
        if (block.type === "paragraph") {
          return (
            <Text key={blockIndex} style={[textStyle, blockIndex > 0 && styles.blockSpacing]}>
              {renderInline(block.text, textStyle, resolvedBoldStyle, `p${blockIndex}`)}
            </Text>
          );
        }
        return (
          <View
            key={blockIndex}
            style={[styles.bulletList, blockIndex > 0 && styles.blockSpacing]}
          >
            {block.items.map((item, itemIndex) => (
              <View key={itemIndex} style={styles.bulletRow}>
                <Text style={[textStyle, { color: resolvedBulletColor }]}>{"\u2022"}</Text>
                <Text style={[textStyle, styles.bulletText]}>
                  {renderInline(item, textStyle, resolvedBoldStyle, `b${blockIndex}-${itemIndex}`)}
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  blockSpacing: {
    marginTop: 2,
  },
  bulletList: {
    gap: 4,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 8,
  },
  bulletText: {
    flex: 1,
  },
});
