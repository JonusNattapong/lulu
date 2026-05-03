import React, { useState } from 'react';
import { Text, Box, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import pc from 'picocolors';
import type { Usage } from '../providers/providers.js';
import { Markdown } from './Markdown.js';
import { resolveTheme } from './theme.js';
import { commandRegistry } from '../core/commands.js';

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

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  
  const [inputMode, setInputMode] = useState<"command" | "provider" | "model">("command");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  const userHistory = messages
    .filter(m => m.role === 'user' && !m.content.startsWith('/edit'))
    .map(m => m.content);

  useInput((_input, key) => {
    if (key.escape) exit();
    
    const isShowingSuggestions = suggestions.length > 0;

    if (key.tab && isShowingSuggestions && inputMode === "command") {
      setQuery(suggestions[suggestionIndex] + ' ');
      setSuggestionIndex(0);
      return;
    }

    if (key.return && isShowingSuggestions) {
      if (inputMode === "command" && query.startsWith('/')) {
        if (query !== suggestions[suggestionIndex] + ' ' && query !== suggestions[suggestionIndex]) {
          const selectedCmd = suggestions[suggestionIndex];
          setQuery(selectedCmd);
          setSuggestionIndex(0);
          void handleSubmit(selectedCmd);
          return;
        }
      } else if (inputMode === "provider" || inputMode === "model") {
        const selected = suggestions[suggestionIndex];
        setQuery(selected);
        setSuggestionIndex(0);
        void handleSubmit(selected);
        return;
      }
    }

    if (key.upArrow) {
      if (isShowingSuggestions) {
        setSuggestionIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
      } else if (userHistory.length > 0) {
        const newPos = historyPos === -1 ? userHistory.length - 1 : Math.max(0, historyPos - 1);
        setHistoryPos(newPos); setQuery(userHistory[newPos]);
      }
    }
    
    if (key.downArrow) {
      if (isShowingSuggestions) {
        setSuggestionIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
      } else if (historyPos !== -1) {
        const newPos = historyPos + 1;
        if (newPos >= userHistory.length) { setHistoryPos(-1); setQuery(''); }
        else { setHistoryPos(newPos); setQuery(userHistory[newPos]); }
      }
    }
  });
  React.useEffect(() => {
    if (inputMode === "command") {
      if (query.startsWith('/')) {
        const matchText = query.substring(1).toLowerCase();
        const cmds = commandRegistry.listCommands().map(c => `/${c.name}`);
        const allCmds = [...new Set([...cmds, '/exit', '/quit', '/dashboard', '/edit'])];
        const matches = allCmds.filter(c => c.startsWith(`/${matchText}`));
        setSuggestions(matches);
        if (suggestionIndex >= matches.length) setSuggestionIndex(0);
      } else {
        setSuggestions([]);
        setSuggestionIndex(0);
      }
    } else if (inputMode === "provider") {
      const matchText = query.toLowerCase();
      const matches = availableProviders.filter(p => p.toLowerCase().includes(matchText));
      setSuggestions(matches);
      if (suggestionIndex >= matches.length) setSuggestionIndex(0);
    } else if (inputMode === "model") {
      const matchText = query.toLowerCase();
      const matches = availableModels.filter(m => m.toLowerCase().includes(matchText));
      setSuggestions(matches);
      if (suggestionIndex >= matches.length) setSuggestionIndex(0);
    }
  }, [query, inputMode, availableProviders, availableModels]);

  const handleSubmit = async (value: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue && inputMode === "command") return;

    setQuery('');

    if (inputMode === "provider") {
      if (!trimmedValue) { setInputMode("command"); return; }
      setInputMode("command");
      await onSendMessage(`/provider ${trimmedValue}`);
      setIsFetchingModels(true);
      try {
        const { fetchAvailableModels } = await import('../providers/models_fetcher.js');
        const models = await fetchAvailableModels({ ...config, provider: trimmedValue } as any);
        setAvailableModels(models);
        setInputMode("model");
      } catch { } finally { setIsFetchingModels(false); }
      return;
    }

    if (inputMode === "model") {
      if (!trimmedValue) { setInputMode("command"); return; }
      setInputMode("command");
      await onSendMessage(`/model ${trimmedValue}`);
      return;
    }

    if (trimmedValue === '/exit' || trimmedValue === '/quit') { exit(); return; }
    if (trimmedValue === '/dashboard') { await onSendMessage('/dashboard'); return; }
    
    if (trimmedValue === '/model') {
      setIsFetchingModels(true);
      try {
        const { fetchAvailableModels } = await import('../providers/models_fetcher.js');
        const models = await fetchAvailableModels(config as any);
        setAvailableModels(models);
        setInputMode("model");
      } catch {
        await onSendMessage(trimmedValue);
      } finally {
        setIsFetchingModels(false);
      }
      return;
    }

    if (trimmedValue === '/provider') {
      try {
        const { getAvailableProviders } = await import('../core/config.js');
        setAvailableProviders(getAvailableProviders());
        setInputMode("provider");
      } catch {
        await onSendMessage(trimmedValue);
      }
      return;
    }

    await onSendMessage(value);
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1} flexDirection="column">
        <Text bold color={theme.primary as any}>{"  _      _    _   _      _    _ "}</Text>
        <Text bold color={theme.primary as any}>{" | |    | |  | | | |    | |  | |"}</Text>
        <Text bold color={theme.primary as any}>{" | |    | |  | | | |    | |  | |"}</Text>
        <Text bold color={theme.primary as any}>{" | |____| |__| | | |____| |__| |"}</Text>
        <Text bold color={theme.primary as any}>{" |______|______| |______|______|"}</Text>
        <Text dimColor color={theme.muted as any}>{"  v0.0.5 · Autonomous AI Assistant"}</Text>
      </Box>

      {/* Messages */}
      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, i) => (
          <Box key={i} marginBottom={1} flexDirection="column">
            <Box marginBottom={msg.content.includes('\n') ? 1 : 0}>
              <Text bold color={msg.role === 'user' ? theme.primary as any : theme.secondary as any}>
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
              <Text bold color={theme.secondary as any}>Lulu: </Text>
            </Box>
            <Box marginLeft={1}>
              <Markdown content={currentResponse} theme={theme} />
            </Box>
          </Box>
        )}
      </Box>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <Box flexDirection="column" marginBottom={1} marginLeft={2}>
          {inputMode === "command" && query !== suggestions[suggestionIndex] + ' ' && query !== suggestions[suggestionIndex] && (
            <Text dimColor>Select command (↑/↓ to navigate, ENTER to run, TAB to autocomplete):</Text>
          )}
          {inputMode === "provider" && (
            <Text bold color={theme.primary as any}>Select a Provider (Type to search, ENTER to confirm):</Text>
          )}
          {inputMode === "model" && (
            <Text bold color={theme.primary as any}>Select a Model for {config?.provider} (Type to search, ENTER to confirm):</Text>
          )}
          
          {(inputMode !== "command" || (query !== suggestions[suggestionIndex] + ' ' && query !== suggestions[suggestionIndex])) && (() => {
            const visibleCount = 10;
            const startIndex = Math.max(0, Math.min(suggestionIndex - Math.floor(visibleCount / 2), suggestions.length - visibleCount));
            const visibleSuggestions = suggestions.slice(startIndex, startIndex + visibleCount);
            
            return (
              <Box flexDirection="column">
                {startIndex > 0 && <Text dimColor>  ...</Text>}
                {visibleSuggestions.map((s, idx) => {
                  const actualIndex = startIndex + idx;
                  const isSelected = actualIndex === suggestionIndex;
                  return (
                    <Text key={s} color={isSelected ? (theme.primary as any) : (theme.muted as any)}>
                      {isSelected ? '❯ ' : '  '}{pc.bold(s)}
                    </Text>
                  );
                })}
                {startIndex + visibleCount < suggestions.length && <Text dimColor>  ...</Text>}
              </Box>
            );
          })()}
        </Box>
      )}

      {isFetchingModels && (
        <Box marginBottom={1}>
          <Text color={theme.secondary as any}>{pc.yellow('●')} Fetching models from API...</Text>
        </Box>
      )}

      {/* Input */}
      <Box>
        <Text bold color={theme.primary as any}>
          {inputMode === "command" ? '> ' : inputMode === "provider" ? 'Search Provider: > ' : 'Search Model: > '}
        </Text>
        <TextInput
          value={query}
          onChange={setQuery}
          onSubmit={handleSubmit}
          placeholder={inputMode === "command" ? "Type your message or /help..." : "Type to filter..."}
        />
      </Box>

      {/* Status bar */}
      {config && (
        <Box marginTop={1} justifyContent="space-between">
          <Box>
            <Text dimColor color={theme.muted as any}>
              {config.provider || 'local'} / {config.model || 'default'}
            </Text>
          </Box>
          <Box>
            <Text dimColor color={theme.muted as any}>
              {isThinking ? pc.yellow('● thinking') : pc.green('● ready')} · ↑/↓ · /edit · ESC:quit
            </Text>
          </Box>
          <Box>
            <Text color={theme.muted as any}>
              {totalUsage.totalTokens} tkn · ${(totalUsage.costEstimate||0).toFixed(4)}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
