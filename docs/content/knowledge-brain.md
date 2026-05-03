# Knowledge Brain (Local RAG)

Lulu's long-term memory is powered by a local, privacy-first Knowledge Brain.

Using `sqlite-vec` and local `Transformers.js` embeddings (`all-MiniLM-L6-v2`), Lulu can index your project files, previous conversations, and architectural decisions. When you ask a question, Lulu performs a semantic search against this local vector database to pull relevant context *before* querying the external LLM.

**Zero Data Leaks:** Because embeddings are calculated locally, your proprietary code never leaves your machine just for indexing.
