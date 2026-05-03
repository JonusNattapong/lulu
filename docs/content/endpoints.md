# API Endpoints Configuration

Lulu allows you to connect to almost any AI service via `.env` overrides.

### Supported Base Variables
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`
- `DEEPSEEK_API_KEY`
- `MISTRAL_API_KEY`
- `KILOCODE_API_KEY`
- `OPENCODE_API_KEY`
- `CLINE_API_KEY`

### Custom Endpoint Overrides
If you are using a proxy, an enterprise gateway, or a local server (like Ollama or LM Studio), you can override the Base URL for any provider by setting the `_BASE_URL` variable:

```env
OPENCODE_BASE_URL=http://localhost:11434/v1
KILOCODE_BASE_URL=https://api.kilo.ai/api/gateway
```

When executing `/model`, Lulu will automatically query `GET {BASE_URL}/models` to fetch the available models for that endpoint.
