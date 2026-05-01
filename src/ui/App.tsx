import React, { useState, useEffect } from 'react';
import { render, Text, Box, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import pc from 'picocolors';
import type { Usage } from '../agent/providers.js';

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
}

export const App: React.FC<AppProps> = ({ onSendMessage, messages, currentResponse, isThinking, totalUsage }) => {
  const [query, setQuery] = useState('');
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape) exit();
  });

  const formatOutput = (text: string) => {
    // Simple inline formatting for Ink
    return text.split(/(\*\*.*?\*\*|`.*?`)/).map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <Text key={i} bold color="yellow">{part.slice(2, -2)}</Text>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <Text key={i} color="magenta">{part.slice(1, -1)}</Text>;
      }
      return <Text key={i}>{part}</Text>;
    });
  };

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
            <Box>
              <Text color={msg.role === 'user' ? 'blue' : 'green'} bold>
                {msg.role === 'user' ? '> ' : 'Lulu: '}
              </Text>
              <Text>{msg.role === 'assistant' ? formatOutput(msg.content) : msg.content}</Text>
            </Box>
          </Box>
        ))}

        {currentResponse && (
          <Box marginBottom={1}>
            <Text color="green" bold>Lulu: </Text>
            <Text>{formatOutput(currentResponse)}</Text>
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
      
      <Box marginTop={1} justifyContent="space-between">
        <Box>
          <Text dimColor>Press ESC to exit</Text>
        </Box>
        <Box>
          <Text color="gray">
            Tokens: {totalUsage.totalTokens} | Est. Cost: ${totalUsage.costEstimate.toFixed(4)}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
