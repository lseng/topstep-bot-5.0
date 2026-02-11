# Ralph Agent Capabilities

This document describes the tools and capabilities available to Ralph during execution.

## Available Tools

### File Operations
- **Read** - Read file contents
- **Write** - Create or overwrite files
- **Edit** - Make targeted edits to existing files
- **Glob** - Find files by pattern
- **Grep** - Search file contents

### Code Execution
- **Bash** - Run shell commands
- Commands: `npm`, `git`, `mkdir`, `cp`, `mv`, `curl`, etc.

### Web Access
- **WebFetch** - Fetch and analyze web content
- **WebSearch** - Search the web for information

## Project Structure

```
topstep-bot-5.0/
├── src/                    # TypeScript source
│   ├── lib/                # Utilities (logger, validation, etc.)
│   ├── services/           # External service integrations
│   │   ├── topstepx/       # TopstepX API client
│   │   └── tradingview/    # TradingView alert parsing
│   └── types/              # TypeScript type definitions
├── api/                    # Vercel serverless functions
│   ├── webhook.ts          # Main TradingView webhook handler
│   ├── health.ts           # Health check endpoint
│   └── events.ts           # SSE streaming endpoint
├── public/                 # Static files
│   └── index.html          # Dashboard page
├── specs/                  # Feature specifications
├── ralph/                  # Ralph configuration
│   ├── loop.sh             # Main loop runner
│   ├── PROMPT_plan.md      # Planning prompt
│   ├── PROMPT_build.md     # Building prompt
│   └── AGENTS.md           # This file
├── adws/                   # AI Developer Workflow System
│   └── adw_modules/        # Python modules
├── IMPLEMENTATION_PLAN.md  # Current plan
└── package.json            # Dependencies
```

## Commands

### Development
```bash
npm run dev          # Start Vercel dev server
npm run build        # TypeScript build
npm run lint         # Run ESLint (0 warnings policy)
npm run typecheck    # TypeScript type check
npm run test         # Run Vitest tests
npm run validate     # Run lint + typecheck + test
```

### Git Operations
```bash
git add <files>      # Stage changes
git commit -m "msg"  # Create commit
git push             # Push to remote
git status           # Check status
```

### Vercel
```bash
vercel dev           # Local development
vercel --prod        # Deploy to production
vercel env ls        # List environment variables
```

## TopstepX API Context

- **Auth**: JWT tokens from `https://api.topstepx.com/api`
- **Real-time**: SignalR WebSocket hubs for quotes, orders, positions
- **Rate Limits**: 60 requests/minute, burst of 10

## Environment Variables

- `TOPSTEPX_USERNAME` - ProjectX account username
- `TOPSTEPX_API_KEY` - ProjectX API key
- `TOPSTEPX_ACCOUNT_NAME` - Trading account name (optional)
- `WEBHOOK_SECRET` - Secret for validating TradingView alerts

## Best Practices

1. **Always run `npm run validate` before committing**
2. **Follow existing code patterns**
3. **Keep changes focused and atomic**
4. **Write clear commit messages**
5. **Update IMPLEMENTATION_PLAN.md when completing tasks**
6. **Never log sensitive data (API keys, secrets)**
