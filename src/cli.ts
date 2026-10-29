import { parseArgs } from 'node:util';
import { loadAssets } from './assets.js';
import { toProfile } from './build.js';
import { EnkaError, fetchProfile } from './enka.js';
import { DEFAULT_UID } from './config.js';
import { formatCharacter, formatProfile } from './format.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    json: { type: 'boolean', default: false },
    character: { type: 'string', short: 'c' },
    refresh: { type: 'boolean', default: false },
    lang: { type: 'string', default: 'en' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(`Usage: npm start -- [uid] [options]

  uid                 Genshin UID (default: $GENSHIN_UID or ${DEFAULT_UID})
  -c, --character     Only show characters whose name contains this text
  --json              Print normalized JSON instead of text
  --refresh           Ignore local cache (profile + asset data)
  --lang <code>       Name language (en, ja, ko, zh-cn, ...; default en)`);
  process.exit(0);
}

const uid = positionals[0] ?? process.env.GENSHIN_UID ?? DEFAULT_UID;

try {
  const [res, assets] = await Promise.all([
    fetchProfile(uid, { useCache: !values.refresh }),
    loadAssets({ lang: values.lang, refresh: values.refresh }),
  ]);
  const profile = toProfile(res, assets);

  if (values.character) {
    const q = values.character.toLowerCase();
    profile.characters = profile.characters.filter((c) => c.name.toLowerCase().includes(q));
    if (!profile.characters.length) {
      console.error(`No showcased character matches "${values.character}".`);
      process.exit(1);
    }
  }

  if (values.json) console.log(JSON.stringify(profile, null, 2));
  else if (values.character) console.log(profile.characters.map(formatCharacter).join('\n\n'));
  else console.log(formatProfile(profile));
} catch (err) {
  if (err instanceof EnkaError) console.error(`Enka error ${err.status}: ${err.message}`);
  else console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
