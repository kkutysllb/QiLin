import { describe, it, expect } from 'vitest';
import { detectPreview } from '@/lib/preview/detect';

describe('detectPreview', () => {
  it('detects image by mime', () => {
    const info = detectPreview('photo.png', 'image/png');
    expect(info.kind).toBe('image');
    expect(info.inline).toBe(true);
  });
  it('detects image by extension', () => {
    expect(detectPreview('avatar.jpg').kind).toBe('image');
    expect(detectPreview('logo.svg').kind).toBe('image');
    expect(detectPreview('favicon.ico').kind).toBe('image');
  });
  it('detects pdf', () => {
    expect(detectPreview('doc.pdf', 'application/pdf').kind).toBe('pdf');
    expect(detectPreview('doc.pdf').kind).toBe('pdf');
  });
  it('detects markdown', () => {
    expect(detectPreview('README.md').kind).toBe('markdown');
  });
  it('detects json with hint', () => {
    const info = detectPreview('package.json');
    expect(info.kind).toBe('json');
    expect(info.hint).toBe('json');
  });
  it('detects code with language hint', () => {
    expect(detectPreview('app.tsx').hint).toBe('tsx');
    expect(detectPreview('main.py').hint).toBe('python');
    expect(detectPreview('Cargo.toml').hint).toBe('toml');
    expect(detectPreview('script.sh').hint).toBe('bash');
  });
  it('detects audio', () => {
    expect(detectPreview('song.mp3', 'audio/mpeg').kind).toBe('audio');
  });
  it('detects video', () => {
    expect(detectPreview('clip.mp4', 'video/mp4').kind).toBe('video');
  });
  it('returns unsupported for unknown', () => {
    const info = detectPreview('data.xyz', 'application/octet-stream');
    expect(info.kind).toBe('unsupported');
    expect(info.inline).toBe(false);
  });
});
