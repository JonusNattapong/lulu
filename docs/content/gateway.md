# AI Gateway

The Gateway is Lulu's translation layer. Because every AI provider (Anthropic, OpenAI, Google) has slightly different payload requirements (especially regarding Tool Calling), the Gateway normalizes these requests.

It primarily leverages the **Anthropic SDK format** internally, and translates it outwards to OpenAI-compatible formats when communicating with proxies like OpenRouter, KiloCode, DeepSeek, or local providers.
