# AhmedGPT

A ChatGPT-style chat website powered by the DeepSeek API.

## Run it

1. Install Node.js 18 or newer.
2. Copy `.env.example` to `.env` and put your key in it.
   - Key from platform.deepseek.com (`sk-...`): set only `DEEPSEEK_API_KEY`.
   - NVIDIA key (`nvapi-...`): also set
     `DEEPSEEK_BASE_URL=https://integrate.api.nvidia.com/v1` and
     `MODEL=deepseek-ai/deepseek-v4.1-flash`.
     You can swap `MODEL` for any other model on your NVIDIA account.
3. Start the server: `npm start`
4. Open http://localhost:3000

No `npm install` is needed. The server has zero dependencies.

## Features

- Streaming replies with a stop button
- Chat history in the sidebar (Pinned / Today / Yesterday / ...), search, pin, rename, delete
- Edit a sent message, regenerate, copy
- **Think** toggle turns on the model's thinking (`deepseek-reasoner`, or `thinking: true` when `MODEL` is set) and shows its reasoning ("Thought for N seconds")
- **Search** button: a web-search agent that searches, reads the most relevant pages, shows each step live, and answers with source links. Set `TAVILY_API_KEY` for reliable search; without it the agent uses Brave, then DuckDuckGo (via `curl`), then Wikipedia. It can't open private or local addresses.
- **Research** button: a task-research agent (adapted from the Task Researcher method). It researches more deeply (up to 14 model calls), compares the options in a table, recommends one approach, and gives an implementation plan (objectives, key tasks, dependencies, success criteria). Reports can be downloaded as Markdown. Only one of Search or Research is on at a time.
- Markdown, tables, code highlighting with copy buttons, LaTeX math
- Attachments via the + button, drag and drop, or paste: text/code files, CSV, JSON, PDF, .docx and images
- Settings: theme, accent color, text size, default model, Enter to send, show thinking, custom instructions (nickname, about you, response style), export or delete all chats
- Suggestion chips, scroll-to-bottom button, Cmd/Ctrl+Shift+O for a new chat
- Smooth motion that respects Reduce Motion; works on phones
- If the main model hasn't started answering within `FALLBACK_AFTER` seconds, `FALLBACK_MODEL` answers instead, and the main model is skipped for 5 minutes

## Notes

- The API key stays on the server; browsers never see it.
- Chat history is saved in each visitor's browser (localStorage), so no database is needed.
- DeepSeek's API is text-only: PDFs, Word files and text files are read and sent as text. Images show in the chat, but the model only sees their file names.
- To put it online, deploy to any Node host (Render, Railway, Fly.io, a VPS) and set `DEEPSEEK_API_KEY` as an environment variable. Anyone with the link will be using your key, so consider adding a login or rate limiting before sharing it widely.
