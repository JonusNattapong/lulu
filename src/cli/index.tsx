import React, { useState, useCallback, useEffect } from 'react';
import { render, useApp } from 'ink';
import open from 'open';
import { App } from '../ui/App.js';
import { loadConfig } from '../core/config.js';
import { runAgent } from '../core/agent.js';
import type { MessageParam } from "@anthropic-ai/sdk/resources/index.js";

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const LuluLauncher = () => {
  const args = process.argv.slice(2);
  const initialPrompt = args.join(' ').trim();
  
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
        // List available providers
        const { getAvailableProviders } = await import('../core/config.js');
        const available = getAvailableProviders();
        setMessages(prev => [...prev, 
          { role: 'user', content: text },
          { role: 'system', content: `Available providers: ${available.join(', ')}\nCurrent provider: ${config.provider}` }
        ]);
      } else {
        const newProvider = parts[1] as any;
        const { PROVIDERS_DATA, getAvailableProviders } = await import('./config.js');
        const available = getAvailableProviders();
        
        if (available.includes(newProvider)) {
          const newConfig = loadConfig({ ...process.env, LULU_PROVIDER: newProvider });
          if (newConfig) {
            setConfig(newConfig);
            setMessages(prev => [...prev, 
              { role: 'user', content: text },
              { role: 'system', content: `Switched to provider: ${newProvider}. Default model: ${newConfig.model}` }
            ]);
          }
        } else {
          setMessages(prev => [...prev, 
            { role: 'user', content: text },
            { role: 'system', content: `Error: Provider '${newProvider}' is not available. Available: ${available.join(', ')}` }
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
        const newConfig = { ...config, model: newModel };
        setConfig(newConfig);
        setMessages(prev => [...prev, 
          { role: 'user', content: text },
          { role: 'system', content: `Switched to model: ${newModel}` }
        ]);
      }
      return;
    }

    if (text === '/dashboard') {
      open('http://localhost:3001');
      setMessages(prev => [...prev, 
        { role: 'user', content: text },
        { role: 'assistant', content: 'Opening Lulu Dashboard at http://localhost:3001 ...' }
      ]);
      return;
    }

    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setIsThinking(true);
    setCurrentResponse('');

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
      
      // If it was a one-shot prompt, exit after responding
      if (initialPrompt) {
        setTimeout(() => exit(), 1000);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'system', content: `Error: ${error instanceof Error ? error.message : String(error)}` }]);
    } finally {
      setIsThinking(false);
    }
  }, [config, context, initialPrompt, exit]);

  useEffect(() => {
    if (initialPrompt && config) {
      handleSendMessage(initialPrompt);
    }
  }, [initialPrompt, config]);

  if (!config) {
    return null; // Onboarding should handle this, but for now simple null
  }

  return (
    <App 
      messages={messages} 
      currentResponse={currentResponse}
      isThinking={isThinking} 
      onSendMessage={handleSendMessage} 
      totalUsage={totalUsage}
    />
  );
};

render(<LuluLauncher />);
