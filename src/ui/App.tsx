import React, { useState, useEffect } from 'react';
import { render, Text, Box, useInput, useApp, Newline } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import pc from 'picocolors';
import type { Usage } from '../providers/providers.js';
import { Markdown } from './Markdown.js';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface AppProps {
  onSendMessage: (message: string) => Promise<void>;
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

  // Build linear history of user messages (oldest first, excludes /edit itself)
  const userHistory = messages
    .filter(m => m.role === 'user' && !m.content.startsWith('/edit'))
    .map(m => m.content);

  useInput((input, key) => {
    if (key.escape) exit();

    if (key.upArrow) {
      if (userHistory.length === 0) return;
      const newPos = historyPos === -1
        ? userHistory.length - 1
        : Math.max(0, historyPos - 1);
      setHistoryPos(newPos);
      setQuery(userHistory[newPos]);
      return;
    }

    if (key.downArrow) {
      if (historyPos === -1) return;
      const newPos = historyPos + 1;
      if (newPos >= userHistory.length) {
        setHistoryPos(-1);
        setQuery('');
      } else {
        setHistoryPos(newPos);
        setQuery(userHistory[newPos]);
      }
      return;
    }
  });

  // use Markdown component instead of formatOutput

  const handleSubmit = async (value: string) => {
    setQuery('');
    if (value === '/exit' || value === '/quit') {
      exit();
      return;
    }
    if (value === '/dashboard') {
      await onSendMessage('/dashboard'); // Let the parent handle the opening logic
      return;
    }
    await onSendMessage(value);
  };

  const logo = `
  _      _    _   _      _    _ 
 | |    | |  | | | |    | |  | |
 | |    | |  | | | |    | |  | |
 | |____| |__| | | |____| |__| |
 |______|______| |______|______|
  `;

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1} flexDirection="column">
        <Text color="cyan" bold>{logo}</Text>
        <Text color="cyan" dimColor> v0.0.5 | Autonomous AI Assistant</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, index) => (
          <Box key={index} marginBottom={1} flexDirection="column">
            <Box marginBottom={msg.content.includes('\n') ? 1 : 0}>
              <Text color={msg.role === 'user' ? 'blue' : 'green'} bold>
                {msg.role === 'user' ? '> ' : 'Lulu: '}
              </Text>
            </Box>
            <Box marginLeft={1}>
              <Markdown content={msg.content} />
            </Box>
          </Box>
        ))}

        {currentResponse && (
          <Box marginBottom={1} flexDirection="column">
            <Box marginBottom={1}>
              <Text color="green" bold>Lulu: </Text>
            </Box>
            <Box marginLeft={1}>
              <Markdown content={currentResponse} />
            </Box>
          </Box>
        )}
      </Box>

      {isThinking && (
        <Box marginBottom={1}>
          <Text color="yellow">
            <Spinner type="dots" /> Lulu is thinking...
          </Text>
        </Box>
      )}

      <Box>
        <Text color="blue" bold>{'> '}</Text>
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
            <Text dimColor>
              {config.provider || 'local'} / {config.model || 'default'}
            </Text>
          </Box>
          <Box>
            <Text dimColor>
              {isThinking ? pc.yellow('● thinking') : pc.green('● ready')} · '↑/↓' nav · '/edit' multiline · 'ESC' quit
            </Text>
          </Box>
          <Box>
            <Text color="gray">
              {totalUsage.totalTokens} tkn · ${(totalUsage.costEstimate || 0).toFixed(4)}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
