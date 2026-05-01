import React, { useState, useCallback, useEffect } from 'react';
import { render, useApp } from 'ink';
import open from 'open';
import { homedir } from 'node:os';
import path from 'node:path';
import { existsSync, rm } from 'node:fs';
import { App } from '../ui/App.js';
import { loadConfig } from '../core/config.js';
import { runAgent } from '../core/agent.js';
import type { MessageParam } from "@anthropic-ai/sdk/resources/index.js";

// One-shot mode: no Ink, just plain text output
const args = process.argv.slice(2);
const initialPrompt = args.join(' ').trim();

if (initialPrompt) {
  const config = loadConfig(process.env);
  if (!config) {
    console.error("No API key found. Run 'lulu' without arguments to set up.");
    process.exit(1);
  }
  runAgent(config, initialPrompt, [], (t) => process.stdout.write(t))
    .then(() => {
      process.stdout.write("\n");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
} else {
  startInteractive();
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function startInteractive() {
  const LuluLauncher = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [currentResponse, setCurrentResponse] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [context, setContext] = useState<MessageParam[]>([]);
    const [totalUsage, setTotalUsage] = useState({ inputTokens: 0, outputTokens: 0, totalTokens: 0, costEstimate: 0 });
    const { exit } = useApp();
    
    const [config, setConfig] = useState(loadConfig());

    const handleSendMessage = useCallback(async (text: string) => {
      if (!config) return;

      if (text.startsWith('/provider')) {
        const parts = text.split(' ');
        if (parts.length === 1) {
          const { getAvailableProviders } = await import('../core/config.js');
          const available = getAvailableProviders();
          setMessages(prev => [...prev, 
            { role: 'user', content: text },
            { role: 'system', content: `Available providers: ${available.join(', ')}\nCurrent provider: ${config.provider}` }
          ]);
        } else {
          const newProvider = parts[1] as any;
          const { getAvailableProviders } = await import('../core/config.js');
          const available = getAvailableProviders();
          
          if (available.includes(newProvider)) {
            const newConfig = loadConfig({ ...process.env, LULU_PROVIDER: newProvider });
            if (newConfig) {
              setConfig(newConfig);
              setMessages(prev => [...prev,
                { role: 'user', content: text },
                { role: 'system', content: `Switched to provider: ${newProvider} (model: ${newConfig.model})` }
              ]);
            }
          } else {
            setMessages(prev => [...prev,
              { role: 'user', content: text },
              { role: 'system', content: `Provider '${newProvider}' not available. Available: ${available.join(', ')}` }
            ]);
          }
        }
        return;
      }

      if (text.startsWith('/model')) {
        const parts = text.split(' ');
        if (parts.length === 1) {
          setMessages(prev => [...prev,
            { role: 'user', content: text },
            { role: 'system', content: `Current model: ${config.model}` }
          ]);
        } else {
          const newModel = parts[1];
          setConfig({ ...config, model: newModel });
          setMessages(prev => [...prev,
            { role: 'user', content: text },
            { role: 'system', content: `Switched to model: ${newModel}` }
          ]);
        }
        return;
      }

      if (text === '/dashboard') {
        open('http://localhost:19456');
        setMessages(prev => [...prev,
          { role: 'user', content: text },
          { role: 'system', content: 'Opening dashboard at http://localhost:19456 in your default browser...' }
        ]);
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
        const result = await runAgent(config, text, context, (chunk) => {
          setCurrentResponse(prev => prev + chunk);
        });
        
        setMessages(prev => [...prev, { role: 'assistant', content: result.finalText || currentResponse }]);
        setCurrentResponse('');
        setContext(result.messages);
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
    }, [config, context]);

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

  render(<LuluLauncher />);
}