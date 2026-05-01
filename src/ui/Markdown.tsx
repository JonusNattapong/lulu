import React from 'react';
import { Text, Box, Newline } from 'ink';
import pc from 'picocolors';

interface MarkdownProps {
  content: string;
}

// Simple tokenizer for markdown code blocks with basic syntax highlighting
function highlightCode(code: string, language?: string): string[] {
  const lines: string[] = [];

  // Simple language-based highlighting
  const keywords = ['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'import', 'export', 'from', 'class', 'extends', 'new', 'this', 'async', 'await', 'try', 'catch', 'throw', 'typeof', 'instanceof'];
  const types = ['string', 'number', 'boolean', 'void', 'null', 'undefined', 'any', 'never', 'unknown'];

  const keywordsRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
  const typesRegex = new RegExp(`\\b(${types.join('|')})\\b`, 'g');
  const stringRegex = /(['"`])(?:(?!\1)[^\\]|\\.)*\1/g;
  const commentRegex = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm;
  const numberRegex = /\b(\d+)\b/g;

  code.split('\n').forEach(line => {
    let result = line;

    // Comments first (so they don't get highlighted as anything else)
    result = result.replace(commentRegex, pc.gray);

    // Strings
    result = result.replace(stringRegex, pc.yellow);

    // Keywords
    result = result.replace(keywordsRegex, pc.cyan);

    // Types
    result = result.replace(typesRegex, pc.magenta);

    // Numbers
    result = result.replace(numberRegex, pc.yellow);

    // Brackets/punctuation — separate replace for safety
    result = result.replace(/([{}\[\](),.;])/g, pc.dim);

    lines.push(result);
  });

  return lines;
}

// Parse inline markdown elements
function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Check for bold: **text**
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Check for italic: *text*
    const italicMatch = remaining.match(/\*(?!\*)(.+?)\*/);
    // Check for code: `code`
    const codeMatch = remaining.match(/`(.+?)`/);
    // Check for link: [text](url)
    const linkMatch = remaining.match(/\[(.+?)\]\((.+?)\)/);

    const matches = [boldMatch, italicMatch, codeMatch, linkMatch].filter(Boolean) as RegExpMatchArray[];
    matches.sort((a, b) => (a?.index ?? 0) - (b?.index ?? 0));

    const firstMatch = matches[0];

    if (firstMatch && firstMatch.index === 0) {
      if (firstMatch === boldMatch) {
        parts.push(<Text key={key++} bold>{firstMatch[1]}</Text>);
      } else if (firstMatch === italicMatch) {
        parts.push(<Text key={key++} italic>{firstMatch[1]}</Text>);
      } else if (firstMatch === codeMatch) {
        parts.push(<Text key={key++} inverse>{firstMatch[1]}</Text>);
      } else if (firstMatch === linkMatch) {
        parts.push(
          <Text key={key++} underline color="cyan">
            {firstMatch[1]}
          </Text>
        );
      }
      remaining = remaining.slice(firstMatch[0].length);
    } else {
      // No match at start — emit plain text until next special char
      const nextSpecial = remaining.search(/(\*\*|\*(?!\*)|`|\[.*?\]\(.*?\))/);
      if (nextSpecial === -1) {
        parts.push(<Text key={key++}>{remaining}</Text>);
        break;
      }
      parts.push(<Text key={key++}>{remaining.slice(0, nextSpecial)}</Text>);
      remaining = remaining.slice(nextSpecial);
    }
  }

  return parts;
}

export const Markdown: React.FC<MarkdownProps> = ({ content }) => {
  const lines: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeContent: string[] = [];
  let codeLanguage = '';
  let key = 0;

  const pushText = (node: React.ReactNode) => {
    lines.push(<Text key={key++}>{node}</Text>);
  };

  const flushCodeBlock = () => {
    if (codeContent.length > 0) {
      lines.push(
        <Box key={key++} flexDirection="column" marginBottom={1}>
          {codeContent.map((line, i) => (
            <Text key={i} color="gray">
              {'  '}{line}
            </Text>
          ))}
        </Box>
      );
      codeContent = [];
      inCodeBlock = false;
      codeLanguage = '';
    }
  };

  content.split('\n').forEach((line) => {
    // Code block start/end
    const codeBlockMatch = line.match(/^```(\w*)$/);
    if (codeBlockMatch) {
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        inCodeBlock = true;
        codeLanguage = codeBlockMatch[1] || '';
        codeContent = [];
      }
      return;
    }

    if (inCodeBlock) {
      const highlighted = highlightCode(line, codeLanguage);
      codeContent.push(...highlighted);
      return;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const colors = ['yellow', 'green', 'cyan', 'magenta', 'red', 'blue'];
      const color = colors[level - 1] || 'white';
      const bold = level <= 2;
      const prefix = '#'.repeat(level) + ' ';
      pushText(
        <Text bold={bold} color={color}>
          {prefix}{text}
        </Text>
      );
      return;
    }

    // Unordered list
    const ulMatch = line.match(/^[\s]*[-*+]\s+(.+)/);
    if (ulMatch) {
      pushText(
        <Text>
          {'  • '}{parseInline(ulMatch[1])}
        </Text>
      );
      return;
    }

    // Ordered list
    const olMatch = line.match(/^[\s]*\d+\.\s+(.+)/);
    if (olMatch) {
      pushText(
        <Text>
          {'  ▶ '}{parseInline(olMatch[1])}
        </Text>
      );
      return;
    }

    // Blockquote
    const quoteMatch = line.match(/^>\s?(.*)/);
    if (quoteMatch) {
      pushText(
        <Text color="gray" italic>
          {'❝ '}{quoteMatch[1]}
        </Text>
      );
      return;
    }

    // Horizontal rule
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) {
      pushText(<Text color="gray">────────────────</Text>);
      return;
    }

    // Empty line
    if (line.trim() === '') {
      pushText(<Newline />);
      return;
    }

    // Regular line — parse inline elements
    pushText(parseInline(line));
  });

  // Flush any remaining code block
  flushCodeBlock();

  return <Box flexDirection="column">{lines}</Box>;
};
