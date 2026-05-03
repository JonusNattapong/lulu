#!/usr/bin/env node
import React, { useState, useCallback, useEffect } from 'react';
import { render, useApp } from 'ink';
import open from 'open';
import { homedir } from 'node:os';
import path from 'node:path';
import { existsSync, rm } from 'node:fs';
import { App } from '../ui/App.js';
import { SessionManager, type SessionRecord } from '../core/session.js';
import { ConfigResolver } from '../core/config_resolver.js';
import { commandRegistry } from '../core/commands.js';
import { detectCapabilities, formatCapabilities } from '../core/capabilities.js';
import { runAgent } from '../core/agent.js';
import { loadPromptBuild } from '../core/config.js';
import { startServer, stopServer } from '../api/server.js';
import { runOnboarding } from '../core/onboarding.js';
import { DEFAULT_API_URL } from '../core/constants.js';
import { validateEnv } from '../core/env.js';
import { logger } from '../core/logger.js';

async function main() {
  validateEnv();
  const args = process.argv.slice(2);
  const initialPrompt = args.join(' ').trim();

  if (initialPrompt) {
    const config = resolveCliConfig(initialPrompt);
    if (!config || !config.apiKey) {
      console.error("No API key found. Run 'lulu' without arguments to set up.");
      process.exit(1);
    }
    try {
      await runAgent(config, initialPrompt, [], (t) => process.stdout.write(t));
      process.stdout.write("\n");
      process.exit(0);
    } catch (err: any) {
      console.error(err.message || String(err));
      process.exit(1);
    }
  } else {
    let config = resolveCliConfig();
    if (!config || !config.apiKey) {
      await runOnboarding();
      config = resolveCliConfig();
      if (!config || !config.apiKey) {
        console.error("Error: Failed to load configuration after onboarding.");
        process.exit(1);
      }
    }
    startInteractive();
  }
}

main().catch(console.error);

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function startInteractive() {
  const LuluLauncher = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [currentResponse, setCurrentResponse] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [sessionManager] = useState(() => new SessionManager());
    const [totalUsage, setTotalUsage] = useState({ inputTokens: 0, outputTokens: 0, totalTokens: 0, costEstimate: 0 });
    const { exit } = useApp();
    
    const [config, setConfig] = useState(() => resolveCliConfig());
    const [session, setSession] = useState<SessionRecord | null>(() => {
      const initialConfig = resolveCliConfig();
      return initialConfig
        ? sessionManager.getOrCreate({ channel: 'cli', subjectId: 'default', title: 'Interactive CLI', config: initialConfig })
        : null;
    });

    useEffect(() => {
      if (!config) return;
      setSession(sessionManager.getOrCreate({ channel: 'cli', subjectId: 'default', title: 'Interactive CLI', config }));
    }, [config, sessionManager]);

    const handleSendMessage = useCallback(async (text: string) => {
      if (!config) return;
      const turnConfig = resolveCliConfig(text);

      const activeSession = session ?? sessionManager.getOrCreate({ channel: 'cli', subjectId: 'default', title: 'Interactive CLI', config: turnConfig });

      // Central Command Handling
      const cmdResult = await commandRegistry.handle(text, { 
        sessionId: activeSession.id, 
        channel: 'cli', 
        config: turnConfig, 
        sessionManager 
      });

      if (cmdResult) {
        setMessages(prev => [...prev, 
          { role: 'user', content: text },
          { role: 'system', content: cmdResult.text }
        ]);
        // Update local state if session changed (e.g. /new)
        setSession(sessionManager.get(activeSession.id));
        // Update config state in case commands like /model or /provider changed environment variables
        setConfig(resolveCliConfig());
        return;
      }

      // Legacy/Special CLI Commands (Dashboard, Edit)
      if (text === '/dashboard') {
        open(DEFAULT_API_URL);
        setMessages(prev => [...prev, { role: 'user', content: text }, { role: 'system', content: 'Opening dashboard...' }]);
        return;
      }

      if (text === '/edit') {
        setIsThinking(false);
        setMessages(prev => [...prev, { role: 'user', content: '[Multi-line edit mode]' }]);
        const tmpPath = path.join(homedir(), '.lulu', 'lulu_edit.txt');
        const fs = await import('node:fs/promises');
        try {
          await fs.writeFile(tmpPath, '');
          const editor = process.env.EDITOR || process.env.VISUAL || 'notepad';
          await open(tmpPath, { wait: true, app: { name: editor } });
          const edited = await fs.readFile(tmpPath, 'utf-8');
          const trimmed = edited.trim();
          if (!trimmed) {
            setMessages(prev => [...prev, { role: 'system', content: 'Edit cancelled or empty.' }]);
            setIsThinking(false);
            return;
          }
          handleSendMessage(trimmed).catch(console.error);
        } catch (err) {
          setMessages(prev => [...prev, { role: 'system', content: `Editor error: ${String(err)}` }]);
          setIsThinking(false);
        } finally {
          try { await fs.rm(tmpPath).catch(() => {}); } catch {}
        }
        return;
      }

      setIsThinking(true);
      setCurrentResponse('');
      setMessages(prev => [
        ...(text.startsWith('/edit') ? prev.slice(0, -1) : prev),
        { role: 'user', content: text }
      ]);

      try {
        const activeSession = session ?? sessionManager.getOrCreate({ channel: 'cli', subjectId: 'default', title: 'Interactive CLI', config: turnConfig });
        const result = await runAgent(turnConfig, text, activeSession.messages, (chunk) => {
          setCurrentResponse(prev => prev + chunk);
        });
        
        setMessages(prev => [...prev, { role: 'assistant', content: result.finalText || currentResponse }]);
        setCurrentResponse('');
        setSession(sessionManager.saveMessages(activeSession.id, result.messages, turnConfig));
        setTotalUsage(prev => ({
          inputTokens: prev.inputTokens + result.usage.inputTokens,
          outputTokens: prev.outputTokens + result.usage.outputTokens,
          totalTokens: prev.totalTokens + result.usage.totalTokens,
          costEstimate: prev.costEstimate + result.usage.costEstimate
        }));
      } catch (error) {
        setMessages(prev => [...prev, { role: 'system', content: `Error: ${error instanceof Error ? error.message : String(error)}` }]);
      } finally {
        setIsThinking(false);
      }
    }, [config, session, sessionManager]);

    if (!config) {
      return null;
    }

    return (
      <App
        messages={messages}
        currentResponse={currentResponse}
        isThinking={isThinking}
        onSendMessage={handleSendMessage}
        totalUsage={totalUsage}
        config={config}
      />
    );
  };

  startServer();
  const { waitUntilExit } = render(<LuluLauncher />);
  waitUntilExit().then(() => {
    stopServer();
  }).catch(() => {
    stopServer();
  });
}

function resolveCliConfig(prompt?: string) {
  const env = {
    ...process.env,
    LULU_CHANNEL: 'cli',
    ...(prompt ? { LULU_PROMPT_QUERY: prompt } : {}),
  };
  const config = ConfigResolver.resolve({ env });
  return {
    ...config,
    systemPrompt: loadPromptBuild(env).systemPrompt,
    channel: 'cli' as const,
  };
}
