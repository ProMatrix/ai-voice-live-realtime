import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { defaultProfile, type IProfile } from '../../../llm-common/src/lib/interfaces';

const hostProfilesDir = path.resolve(process.cwd(), 'shared-profiles', 'host-gemini-voice');
const commonProfilesDir = path.resolve(process.cwd(), 'shared-profiles', 'common');

const activeProfileNames = [
  'developer-assistant',
  'developer-researcher',
  'microsoft-AI-discussion',
  'programming-essentials',
] as const;

type ActiveProfileName = (typeof activeProfileNames)[number];

function loadProfile(profileName: ActiveProfileName): IProfile {
  const profilePath = path.join(hostProfilesDir, `${profileName}.json`);
  const profileJson = readFileSync(profilePath, 'utf8');
  return {
    ...defaultProfile,
    ...(JSON.parse(profileJson) as Partial<IProfile>),
  };
}

function resolveProfileAsset(assetPath: string): string | null {
  if (!assetPath.trim()) {
    return null;
  }

  const normalizedAssetPath = assetPath
    .replace(/^\/?assets\/profiles\//, '')
    .replace(/^\/+/, '');

  const candidatePaths = [
    path.join(hostProfilesDir, normalizedAssetPath),
    path.join(commonProfilesDir, normalizedAssetPath),
  ];

  return candidatePaths.find((candidatePath) => existsSync(candidatePath)) ?? null;
}

describe('host-gemini active profile regression contract', () => {
  it('keeps unique non-empty session profile ids', () => {
    const profileIds = activeProfileNames.map((profileName) => loadProfile(profileName).profile_id.trim());

    expect(profileIds.every((profileId) => profileId.length > 0)).toBe(true);
    expect(new Set(profileIds).size).toBe(profileIds.length);
  });

  for (const profileName of activeProfileNames) {
    it(`${profileName} resolves its required assets`, () => {
      const profile = loadProfile(profileName);

      expect(profile.profile_title.trim()).not.toBe('');
      expect(profile.profile_id.trim()).not.toBe('');
      expect(profile.voice_name.trim()).not.toBe('');
      expect(profile.model_instructions?.trim()).not.toBe('');
      expect(resolveProfileAsset(profile.model_instructions ?? '')).not.toBeNull();

      if (profile.dialogue_file.trim()) {
        expect(resolveProfileAsset(profile.dialogue_file)).not.toBeNull();
      }

      if (profile.pdf_file.trim()) {
        expect(resolveProfileAsset(profile.pdf_file)).not.toBeNull();
      }

      for (const resourceFile of profile.resource_files) {
        expect(resolveProfileAsset(resourceFile)).not.toBeNull();
      }

      if (profile.pre_recorded) {
        expect(profile.dialogue_file.trim()).not.toBe('');
        expect(profile.inputs_opening_utterance.trim()).not.toBe('');
      }

      if (profile.go_bridge.trim()) {
        expect(existsSync(path.join(hostProfilesDir, `${profile.go_bridge}.json`))).toBe(true);
      }
    });
  }
});