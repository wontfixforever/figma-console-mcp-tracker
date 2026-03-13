/**
 * Session Tracker
 *
 * Accumulates a structured activity log for the current MCP server session.
 * Persists to /Users/msallah/Desktop/claude-code/Session Logs/figma/
 * one JSON file per session (keyed by UUID).
 *
 * Events are appended on every log call. Selection-changed events are pruned
 * first when the ring buffer fills, preserving high-value tool_call events.
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { createChildLogger } from './logger.js';
import type {
  SessionEvent,
  SessionLog,
  ToolCallEvent,
} from './session-tracker-types.js';

const logger = createChildLogger({ component: 'session-tracker' });

const LOG_DIR = '/Users/msallah/Desktop/claude-code/Session Logs/figma';
const MAX_LOG_FILES = 30;
const MAX_EVENTS = 5000;
const PRUNE_TARGET = Math.floor(MAX_EVENTS * 0.8);

export class SessionTracker {
  private log: SessionLog;
  private logPath: string;
  private currentPage: string | null = null;
  private currentFileKey: string | null = null;
  private currentFileName: string | null = null;

  constructor() {
    const sessionId = randomUUID();

    this.log = {
      version: 1,
      sessionId,
      startedAt: Date.now(),
      lastUpdatedAt: Date.now(),
      files: {},
      events: [],
    };

    try {
      if (!existsSync(LOG_DIR)) {
        mkdirSync(LOG_DIR, { recursive: true });
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to create session log directory');
    }

    this.logPath = join(LOG_DIR, `session-${sessionId}.json`);
    this.rotateLogs();
    this.persist();

    logger.info({ sessionId, logPath: this.logPath }, 'Session tracker started');
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /** Record any session event and persist to disk. */
  logEvent(event: SessionEvent): void {
    // Update running context
    if (event.kind === 'page_changed') {
      this.currentPage = event.pageName;
    }
    if (event.kind === 'file_connected') {
      this.currentFileKey = event.fileKey;
      this.currentFileName = event.fileName;
      const key = event.fileKey ?? 'unknown';
      if (!this.log.files[key]) {
        this.log.files[key] = {
          fileName: event.fileName,
          firstSeenAt: event.timestamp,
        };
      }
    }

    this.log.events.push(event);
    this.log.lastUpdatedAt = Date.now();

    if (this.log.events.length > MAX_EVENTS) {
      this.prune();
    }

    this.persist();
  }

  /** Current Figma page name (updated from page_changed events). */
  getCurrentPage(): string | null {
    return this.currentPage;
  }

  /** Active file key (updated from file_connected + FILE_INFO). */
  getCurrentFileKey(): string | null {
    return this.currentFileKey;
  }

  /** Active file name. */
  getCurrentFileName(): string | null {
    return this.currentFileName;
  }

  /** Return a snapshot of the full session log. */
  getLog(): SessionLog {
    return {
      ...this.log,
      events: [...this.log.events],
    };
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private persist(): void {
    try {
      writeFileSync(this.logPath, JSON.stringify(this.log, null, 2), 'utf-8');
    } catch (err) {
      logger.warn({ err }, 'Failed to persist session log (non-fatal)');
    }
  }

  /**
   * Prune to PRUNE_TARGET events.
   * Drop selection_changed first (highest volume, lowest value),
   * then document_changed, then oldest events of any kind.
   */
  private prune(): void {
    const kinds: SessionEvent['kind'][] = ['selection_changed', 'document_changed'];

    for (const kind of kinds) {
      if (this.log.events.length <= PRUNE_TARGET) break;

      const before = this.log.events.length;
      this.log.events = this.log.events.filter(
        (e, i) =>
          e.kind !== kind ||
          i >= this.log.events.length - PRUNE_TARGET,
      );

      if (this.log.events.length < before) continue;
    }

    // If still over target, drop oldest events
    if (this.log.events.length > PRUNE_TARGET) {
      this.log.events = this.log.events.slice(this.log.events.length - PRUNE_TARGET);
    }
  }

  /** Keep only the last MAX_LOG_FILES session files; delete older ones. */
  private rotateLogs(): void {
    try {
      const files = readdirSync(LOG_DIR)
        .filter(f => f.startsWith('session-') && f.endsWith('.json'))
        .sort(); // lexicographic on session-{uuid}.json is roughly chronological by creation order

      while (files.length >= MAX_LOG_FILES) {
        const oldest = files.shift()!;
        try {
          unlinkSync(join(LOG_DIR, oldest));
          logger.debug({ file: oldest }, 'Rotated old session log');
        } catch {
          // Non-fatal
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Log rotation failed (non-fatal)');
    }
  }
}

// ─── Helpers exported for use in local.ts ────────────────────────────────────

/**
 * Sanitize tool params for storage:
 * - Replace `code` field (JS blobs) with a placeholder
 * - Truncate strings over 300 chars
 */
export function sanitizeParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (k === 'code') {
      out[k] = '[code truncated]';
    } else if (typeof v === 'string' && v.length > 300) {
      out[k] = v.slice(0, 300) + '…';
    } else {
      out[k] = v;
    }
  }
  return out;
}

export type { SessionEvent, ToolCallEvent };
