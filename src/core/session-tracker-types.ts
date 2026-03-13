/**
 * Session Tracker Types
 *
 * Data model for the Figma session activity log. Records tool calls (assisted work),
 * document change events (manual + assisted), page navigation, and file connections.
 */

// ─── Document change sub-types ────────────────────────────────────────────────

export interface RichDocumentChangeSummary {
  creates: number;
  deletes: number;
  propertyChanges: number;
  styleChanges: number;
  changedNodeIds: string[];
  hasStyleChanges: boolean;
  hasNodeChanges: boolean;
  changeCount: number;
  timestamp: number;
}

// ─── Session event union ───────────────────────────────────────────────────────

export type SessionEventKind =
  | 'file_connected'
  | 'page_changed'
  | 'selection_changed'
  | 'document_changed'
  | 'tool_call';

interface BaseSessionEvent {
  kind: SessionEventKind;
  timestamp: number;
  fileKey: string | null;
  fileName: string | null;
}

export interface FileConnectedEvent extends BaseSessionEvent {
  kind: 'file_connected';
  pageName: string | null;
}

export interface PageChangedEvent extends BaseSessionEvent {
  kind: 'page_changed';
  pageId: string;
  pageName: string;
}

export interface SelectionChangedEvent extends BaseSessionEvent {
  kind: 'selection_changed';
  nodes: Array<{ id: string; name: string; type: string }>;
  count: number;
  page: string;
}

export interface DocumentChangedEvent extends BaseSessionEvent {
  kind: 'document_changed';
  summary: RichDocumentChangeSummary;
}

/**
 * Recorded when a design-mutation MCP tool call completes (or fails).
 * params is a sanitized shallow copy of the tool's input (code blobs truncated).
 * resultSummary is a human-readable description derived from params.
 */
export interface ToolCallEvent extends BaseSessionEvent {
  kind: 'tool_call';
  tool: string;
  params: Record<string, unknown>;
  success: boolean;
  durationMs: number;
  resultSummary: string | null;
  errorMessage: string | null;
  page: string | null;
}

export type SessionEvent =
  | FileConnectedEvent
  | PageChangedEvent
  | SelectionChangedEvent
  | DocumentChangedEvent
  | ToolCallEvent;

// ─── Top-level log structure ────────────────────────────────────────────────

export interface SessionFileEntry {
  fileName: string | null;
  firstSeenAt: number;
}

export interface SessionLog {
  version: 1;
  sessionId: string;
  startedAt: number;
  lastUpdatedAt: number;
  /** Keyed by fileKey (or 'unknown') */
  files: Record<string, SessionFileEntry>;
  events: SessionEvent[];
}
