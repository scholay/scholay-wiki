// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminTurnArtifacts } from './AdminTurnArtifacts';

afterEach(() => cleanup());

describe('AdminTurnArtifacts', () => {
  it('耐久目录产物与用户端一样提供打包下载', () => {
    render(
      <AdminTurnArtifacts
        artifacts={[
          {
            id: 91,
            sessionId: 'session-1',
            path: 'out/slides',
            name: 'slides',
            title: 'PPT 工程',
            description: '可编辑源文件',
            kind: 'dir',
            mime: 'application/zip',
            size: 1024,
            source: 'storage',
            storageAvailable: true,
            workspaceAvailable: false,
            url: '/admin/agent-sessions/session-1/artifact/91',
          },
        ]}
      />,
    );

    expect(screen.getByTitle('PPT 工程')).toBeTruthy();
    expect(screen.getByRole('button', { name: '打包下载' })).toBeTruthy();
  });

  it('仅 workspace 的临时目录不伪装成可下载 zip', () => {
    render(
      <AdminTurnArtifacts
        artifacts={[
          {
            id: 0,
            sessionId: 'session-2',
            path: 'out/pending',
            name: 'pending',
            title: '',
            description: '',
            kind: 'dir',
            mime: '',
            size: 0,
            source: 'workspace',
            storageAvailable: false,
            workspaceAvailable: true,
            url: '/admin/agent-sessions/session-2/file?path=out%2Fpending',
          },
        ]}
      />,
    );

    expect(screen.queryByRole('button', { name: '打包下载' })).toBeNull();
  });
});
