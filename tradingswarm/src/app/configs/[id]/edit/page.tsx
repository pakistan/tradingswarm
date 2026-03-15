import { getDb } from '@/lib/db/index';
import { getConfig, getLatestVersion, getVersionRules, getVersionCapabilities, listRules, listTools, listModelProviders } from '@/lib/db/configs';
import { notFound } from 'next/navigation';
import { ConfigEditorClient } from './config-editor-client';

function getEditorData(configId: number) {
  const db = getDb();
  const config = getConfig(db, configId);
  if (!config) return null;

  const latestVersion = getLatestVersion(db, configId);
  const allRules = listRules(db);
  const allTools = listTools(db);
  const modelProviders = listModelProviders(db);

  let versionRules: { rule_id: number; enabled: number }[] = [];
  let versionCaps: { capability_id: number; enabled: number }[] = [];

  if (latestVersion) {
    versionRules = getVersionRules(db, latestVersion.version_id).map(r => ({
      rule_id: r.rule_id,
      enabled: r.enabled,
    }));
    versionCaps = getVersionCapabilities(db, latestVersion.version_id).map(c => ({
      capability_id: c.capability_id,
      enabled: c.enabled,
    }));
  }

  return {
    config,
    latestVersion,
    allRules,
    allTools,
    modelProviders,
    versionRules,
    versionCaps,
  };
}

export default function ConfigEditorPage({ params }: { params: { id: string } }) {
  const configId = parseInt(params.id, 10);
  if (isNaN(configId)) notFound();

  const data = getEditorData(configId);
  if (!data) notFound();

  return (
    <ConfigEditorClient
      config={data.config}
      latestVersion={data.latestVersion ?? null}
      allRules={data.allRules}
      allTools={data.allTools}
      modelProviders={data.modelProviders}
      versionRules={data.versionRules}
      versionCaps={data.versionCaps}
    />
  );
}
