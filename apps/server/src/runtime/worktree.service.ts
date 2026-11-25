import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { AgentProfile, RoomConfig } from '@agent-office/shared';
import { ConfigSyncService } from '../sync/config-sync.service';

const execFileAsync = promisify(execFile);

export interface PreparedWorkspace {
  workingDir: string;
  worktreePath?: string;
  worktreeBranch?: string;
  isolated: boolean;
}

@Injectable()
export class WorktreeService {
  constructor(private readonly configSync: ConfigSyncService) {}

  async isGitRepoWithCommit(folderPath: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['rev-parse', '--verify', 'HEAD'], {
        cwd: folderPath,
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Allocates or reuses an isolated Git worktree for concurrent Worker execution.
   * Gracefully falls back to `room.folderPath` if the folder is not a Git repository.
   */
  async prepareWorkerWorkspace(
    room: RoomConfig,
    agent: AgentProfile,
    taskId: string,
    reuseWorktree?: { path?: string; branch?: string },
  ): Promise<PreparedWorkspace> {
    if (
      reuseWorktree?.path &&
      existsSync(reuseWorktree.path) &&
      resolve(reuseWorktree.path).startsWith(resolve(room.folderPath))
    ) {
      await this.configSync.syncRoomToDir(room, reuseWorktree.path);
      return {
        workingDir: reuseWorktree.path,
        worktreePath: reuseWorktree.path,
        worktreeBranch: reuseWorktree.branch,
        isolated: true,
      };
    }

    const canWorktree = await this.isGitRepoWithCommit(room.folderPath);
    if (!canWorktree) {
      return {
        workingDir: room.folderPath,
        isolated: false,
      };
    }

    const safeAgent = agent.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16) || 'worker';
    const shortTask = taskId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    const branchName = `agent-office/${safeAgent}/${shortTask}`;
    const worktreesRoot = join(room.folderPath, '.agent-office', 'worktrees');
    await mkdir(worktreesRoot, { recursive: true });
    const worktreePath = join(worktreesRoot, `${safeAgent}-${shortTask}`);

    try {
      await execFileAsync(
        'git',
        ['worktree', 'add', '-B', branchName, worktreePath, 'HEAD'],
        {
          cwd: room.folderPath,
          timeout: 15_000,
        },
      );
      await this.configSync.syncRoomToDir(room, worktreePath);
      return {
        workingDir: worktreePath,
        worktreePath,
        worktreeBranch: branchName,
        isolated: true,
      };
    } catch {
      // Fallback safely if worktree creation fails (e.g., locked index or submodules)
      return {
        workingDir: room.folderPath,
        isolated: false,
      };
    }
  }

  async summarizeWorktreeChanges(worktreePath?: string): Promise<string | undefined> {
    if (!worktreePath || !existsSync(worktreePath)) return undefined;
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['status', '--short', '--untracked-files=normal'],
        {
          cwd: worktreePath,
          timeout: 5000,
        },
      );
      const lines = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.includes('.agents') && !l.includes('.codex') && !l.endsWith('AGENTS.md'));
      if (lines.length === 0) return undefined;
      const preview = lines.slice(0, 12).join(', ');
      return lines.length > 12
        ? `变更文件 (${lines.length}): ${preview} ...`
        : `变更文件 (${lines.length}): ${preview}`;
    } catch {
      return undefined;
    }
  }

  async removeWorktree(
    roomFolderPath: string,
    worktreePath: string,
  ): Promise<{ removed: boolean }> {
    const absRoom = resolve(roomFolderPath);
    const absWt = resolve(worktreePath);
    if (!absWt.startsWith(join(absRoom, '.agent-office', 'worktrees'))) {
      return { removed: false };
    }
    try {
      await execFileAsync('git', ['worktree', 'remove', '--force', absWt], {
        cwd: absRoom,
        timeout: 10_000,
      });
      return { removed: true };
    } catch {
      return { removed: false };
    }
  }
}
