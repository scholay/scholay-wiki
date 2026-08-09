import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type PackageFile = {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

type LockPackage = { version?: string };
type PackageLock = { packages: Record<string, LockPackage> };

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as T;
const pkg = readJson<PackageFile>('package.json');
const lock = readJson<PackageLock>('package-lock.json');

function lockedVersions(packageName: string): Set<string> {
  const suffix = `node_modules/${packageName}`;
  return new Set(
    Object.entries(lock.packages)
      .filter(([path]) => path === suffix || path.endsWith(`/${suffix}`))
      .map(([, metadata]) => metadata.version)
      .filter((version): version is string => Boolean(version)),
  );
}

describe('production dependency contract', () => {
  it('does not restore audited unused direct packages', () => {
    for (const packageName of [
      '@xyflow/react',
      '@testing-library/user-event',
      '@types/dompurify',
      '@tiptap/extension-table-cell',
      '@tiptap/extension-table-header',
      '@tiptap/extension-table-row',
    ]) {
      expect(pkg.dependencies, packageName).not.toHaveProperty(packageName);
      expect(pkg.devDependencies, packageName).not.toHaveProperty(packageName);
    }
  });

  it('declares runtime drag-and-drop packages as production dependencies', () => {
    for (const packageName of ['@dnd-kit/core', '@dnd-kit/sortable']) {
      expect(pkg.dependencies).toHaveProperty(packageName);
      expect(pkg.devDependencies).not.toHaveProperty(packageName);
    }
  });

  it('keeps the shared Radix primitives on one lockfile version each', () => {
    expect([...lockedVersions('@radix-ui/react-context')]).toEqual(['1.1.2']);
    expect([...lockedVersions('@radix-ui/react-primitive')]).toEqual(['2.1.3']);
    expect([...lockedVersions('@radix-ui/react-slot')]).toEqual(['1.2.3']);
  });

  it('imports table primitives from the supported aggregate Tiptap extension', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/features/prism/components/StructEditor.tsx'),
      'utf8',
    );
    expect(source).toContain("from '@tiptap/extension-table'");
    expect(source).not.toMatch(/@tiptap\/extension-table-(?:cell|header|row)/);
  });
});
