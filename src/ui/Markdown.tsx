import React from 'react';
import { Text, Box, Newline } from 'ink';
import pc from 'picocolors';

type Theme = Record<string, any>;

interface MarkdownProps {
  content: string;
  theme?: Record<string, any>;
}

// Simple tokenizer for code blocks — uses string color names compatible with picocolors
function highlightCode(code: string): string[] {
  const lines: string[] = [];
  const keywords = ['function','const','let','var','if','else','for','while','return','import','export','from','class','extends','new','this','async','await','try','catch','throw','typeof','instanceof'];
  const types = ['string','number','boolean','void','null','undefined','any','never','unknown'];
  const keywordsRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
  const typesRegex = new RegExp(`\\b(${types.join('|')})\\b`, 'g');
  const stringRegex = /(['"`])(?:(?!\1)[^\\]|\\.)*\1/g;
  const commentRegex = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm;
  const numberRegex = /\b(\d+)\b/g;

  code.split('\n').forEach(line => {
    let result = line
      .replace(commentRegex, '\x1b[90m$1\x1b[0m')
      .replace(stringRegex, '\x1b[93m$&\x1b[0m')
      .replace(keywordsRegex, '\x1b[36m$&\x1b[0m')
      .replace(typesRegex, '\x1b[35m$&\x1b[0m')
      .replace(numberRegex, '\x1b[33m$1\x1b[0m')
      .replace(/([{}\[\](),.;])/g, '\x1b[90m$1\x1b[0m');
    lines.push(result);
  });
  return lines;
}

function parseInline(text: string, theme?: Theme): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/\*(?!\*)(.+?)\*/);
    const codeMatch = remaining.match(/`(.+?)`/);
    const linkMatch = remaining.match(/\[(.+?)\]\((.+?)\)/);

    const matches = [boldMatch, italicMatch, codeMatch, linkMatch].filter(Boolean) as RegExpMatchArray[];
    matches.sort((a, b) => (a?.index ?? 0) - (b?.index ?? 0));
    const first = matches[0];

    if (first && first.index === 0) {
      if (first === boldMatch) parts.push(<Text key={key++} bold>{first[1]}</Text>);
      else if (first === italicMatch) parts.push(<Text key={key++} italic>{first[1]}</Text>);
      else if (first === codeMatch) parts.push(<Text key={key++} inverse>{first[1]}</Text>);
      else if (first === linkMatch) parts.push(<Text key={key++} underline color="cyan">{first[1]}</Text>);
      remaining = remaining.slice(first[0].length);
    } else {
      const next = remaining.search(/(\*\*|\*(?!\*)|`|\[.*?\]\(.*?\))/);
      if (next === -1) {
        parts.push(<Text key={key++}>{remaining}</Text>);
        break;
      }
      parts.push(<Text key={key++}>{remaining.slice(0, next)}</Text>);
      remaining = remaining.slice(next);
    }
  }
  return parts;
}

export const Markdown: React.FC<MarkdownProps> = ({ content, theme }) => {
  const lines: React.ReactNode[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let key = 0;

  const push = (node: React.ReactNode) => { lines.push(<Text key={key++}>{node}</Text>); };

  const flush = () => {
    if (codeBuf.length === 0) return;
    lines.push(
      <Box key={key++} flexDirection="column" marginBottom={1}>
        {codeBuf.map((line, i) => (
          <Text key={i} color="gray">{'  '}{line}</Text>
        ))}
      </Box>
    );
    codeBuf = []; inCode = false;
  };

  content.split('\n').forEach(line => {
    const codeMarker = line.match(/^```(\w*)$/);
    if (codeMarker) {
      if (inCode) flush();
      else { inCode = true; codeBuf = []; }
      return;
    }

    if (inCode) {
      codeBuf.push(...highlightCode(line));
      return;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)/);
    if (heading) {
      const lvl = heading[1].length;
      const colors = theme?.headings || ['yellow','green','cyan','magenta','red','blue'];
      push(
        <Text bold color={colors[lvl-1] || 'white'}>
          {'#'.repeat(lvl) + ' '}{heading[2]}
        </Text>
      );
      return;
    }

    const ul = line.match(/^[\s]*[-*+]\s+(.+)/);
    if (ul) { push(<Text>{'  • '}{parseInline(ul[1], theme)}</Text>); return; }

    const ol = line.match(/^[\s]*\d+\.\s+(.+)/);
    if (ol) { push(<Text>{'  ▶ '}{parseInline(ol[1], theme)}</Text>); return; }

    const quote = line.match(/^>\s?(.*)/);
    if (quote) { push(<Text color="gray" italic>{'❝ '}{quote[1]}</Text>); return; }

    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) {
      push(<Text color="gray">────────────────</Text>); return;
    }

    if (line.trim() === '') { push(<Newline/>); return; }

    push(parseInline(line, theme));
  });

  flush();
  return <Box flexDirection="column">{lines}</Box>;
};
