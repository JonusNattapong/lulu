import React, { useState } from 'react';
import { Text, Box, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import pc from 'picocolors';
import type { Usage } from '../providers/providers.js';
import { Markdown } from './Markdown.js';
import { resolveTheme } from './theme.js';

const theme = resolveTheme(process.env.LULU_THEME);

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface AppProps {
  onSendMessage: (m: string) => Promise<void>;
  messages: Message[];
  currentResponse: string;
  isThinking: boolean;
  totalUsage: Usage;
  config?: { provider?: string; model?: string };
}

export const App: React.FC<AppProps> = ({ onSendMessage, messages, currentResponse, isThinking, totalUsage, config }) => {
  const [query, setQuery] = useState('');
  const [historyPos, setHistoryPos] = useState(-1);
  const { exit } = useApp();

  const userHistory = messages
    .filter(m => m.role === 'user' && !m.content.startsWith('/edit'))
    .map(m => m.content);

  useInput((_input, key) => {
    if (key.escape) exit();
    if (key.upArrow && userHistory.length > 0) {
      const newPos = historyPos === -1 ? userHistory.length - 1 : Math.max(0, historyPos - 1);
      setHistoryPos(newPos); setQuery(userHistory[newPos]);
    }
    if (key.downArrow) {
      if (historyPos === -1) return;
      const newPos = historyPos + 1;
      if (newPos >= userHistory.length) { setHistoryPos(-1); setQuery(''); }
      else { setHistoryPos(newPos); setQuery(userHistory[newPos]); }
    }
  });

  const handleSubmit = async (value: string) => {
    setQuery('');
    if (value === '/exit' || value === '/quit') { exit(); return; }
    if (value === '/dashboard') { await onSendMessage('/dashboard'); return; }
    await onSendMessage(value);
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1} flexDirection="column">
        <Text bold color={theme.colors.primary as any}>{"  _      _    _   _      _    _ "}</Text>
        <Text bold color={theme.colors.primary as any}>{" | |    | |  | | | |    | |  | |"}</Text>
        <Text bold color={theme.colors.primary as any}>{" | |    | |  | | | |    | |  | |"}</Text>
        <Text bold color={theme.colors.primary as any}>{" | |____| |__| | | |____| |__| |"}</Text>
        <Text bold color={theme.colors.primary as any}>{" |______|______| |______|______|"}</Text>
        <Text dimColor color={theme.colors.muted as any}>{"  v0.0.5 · Autonomous AI Assistant"}</Text>
      </Box>

      {/* Messages */}
      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, i) => (
          <Box key={i} marginBottom={1} flexDirection="column">
            <Box marginBottom={msg.content.includes('\n') ? 1 : 0}>
              <Text bold color={msg.role === 'user' ? theme.colors.primary as any : theme.colors.secondary as any}>
                {msg.role === 'user' ? '> ' : 'Lulu: '}
              </Text>
            </Box>
            <Box marginLeft={1}>
              <Markdown content={msg.content} theme={theme} />
            </Box>
          </Box>
        ))}

        {currentResponse && (
          <Box marginBottom={1} flexDirection="column">
            <Box marginBottom={1}>
              <Text bold color={theme.colors.secondary as any}>Lulu: </Text>
            </Box>
            <Box marginLeft={1}>
              <Markdown content={currentResponse} theme={theme} />
            </Box>
          </Box>
        )}
      </Box>

      {/* Input */}
      <Box>
        <Text bold color={theme.colors.primary as any}>{'> '}</Text>
        <TextInput
          value={query}
          onChange={setQuery}
          onSubmit={handleSubmit}
          placeholder="Type your message or /help..."
        />
      </Box>

      {/* Status bar */}
      {config && (
        <Box marginTop={1} justifyContent="space-between">
          <Box>
            <Text dimColor color={theme.colors.muted as any}>
              {config.provider || 'local'} / {config.model || 'default'}
            </Text>
          </Box>
          <Box>
            <Text dimColor color={theme.colors.muted as any}>
              {isThinking ? pc.yellow('● thinking') : pc.green('● ready')} · ↑/↓ · /edit · ESC:quit
            </Text>
          </Box>
          <Box>
            <Text color={theme.colors.muted as any}>
              {totalUsage.totalTokens} tkn · ${(totalUsage.costEstimate||0).toFixed(4)}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
