# AGENTS.md

## Project Overview

Kanmail is a desktop email client that functions like a kanban board, built with Wails v3 (Go backend + React frontend). It supports Mac, Windows, and Linux.

## Architecture Overview

### Backend (Go)

**Entry Point**: `main.go` creates the Kanmail app and starts the Wails app.

**Core Structure** (`internal/kanmail.go`):
- `Kanmail` struct holds the Wails app and all services
- Services are registered with Wails as bound Go methods callable from frontend
- Circular dependencies are resolved via `Bootstrap()` pattern

**Services** (`internal/services/`):
- `AppService`: Application lifecycle, window management, license checking, analytics
- `SettingsService`: User settings and configuration persistence
- `AccountsService`: Manages email accounts (creates/deletes Account instances)
- `EmailsService`: High-level email operations (send, fetch, etc.)
- `ContactsService`: Contact management and avatars

**Email Implementation** (`internal/emails/`):
- `Account`: Represents a single email account with IMAP/SMTP connection pools
- `Folder`: Represents an IMAP mailbox with UID tracking and pagination
  - Tracks UIDs for pagination
  - UIDs themselves are also paginated if >1000 in a folder
  - Uses sparse UID → email cache populated during pagination
  - `lastSentUID` and `lastSentDate` track what frontend knows about
- `ConnectionPool`: Manages pooled IMAP/SMTP connections (regular, priority, background)
- `imapinterface/`: Abstraction layer allowing fake IMAP for testing/screenshots

**Key Patterns**:
- Connection pooling for IMAP/SMTP with priority levels
- UID-based pagination for email folders (folders >1000 emails paginate)
- Sparse caching with cache invalidation on UID validity changes
- OAuth2 support with token refresh (see `emails/oauth/`)
- Context-based logging with `zerolog`

**Caches** (`internal/caches/`):
- SQLite-based caching (avatars, contacts, email metadata, folder UIDs, licenses)
- Single shared `caches.db` file managed by `Caches` struct

**Types** (`internal/types/`):
- `AccountSettings`, `FolderName`, `AccountName`, `Email` and other domain types
- `AccountError` for wrapping account-specific errors
- Event types for frontend communication

### Frontend (React + TypeScript)

**Build System**: Vite with React plugin, TypeScript checking, Babel decorators support

**Structure**:
- `src/components/`: React components organized by feature
  - `emails/`: Email list, thread, message components
  - `settings/`: Settings UI components
  - `contacts/`, `send/`, `license/`, etc.
- `src/stores/`: State management using custom store pattern
  - `base.tsx`: BaseStore class with subscription system
  - `emails/`, `settings.ts`, `contacts.ts`, etc.
  - Uses decorator pattern with `@subscribe` for component subscriptions
- `src/util/`: Utility functions
- `src/styles/`: LESS stylesheets
- `src/wails/`: Auto-generated Wails runtime (DO NOT EDIT MANUALLY)
- `src/bindings/`: Auto-generated Go service bindings (DO NOT EDIT MANUALLY)

**State Management**:
- Custom store pattern with `BaseStore` class
- Components subscribe to stores via `subscribe()` decorator
- Stores notify subscribed components on state changes

## Important Notes

- NEVER edit files in `frontend/wails/` or `frontend/bindings/` - they are auto-generated
- The project uses a custom fork of go-imap (`github.com/oxygem/go-imap/v2`) - see replace directive in `go.mod

- Email threading logic in `frontend/src/threading.js`
- Connection pools maintain 2 regular + 2 priority + 1 background IMAP connections per account

- Do not include redundant or unncessary comments, code should be self-explanatory where possible
