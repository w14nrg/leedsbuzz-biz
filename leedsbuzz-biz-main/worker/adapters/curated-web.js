import { hashString, markSourceFetched, upsertKnowledgeFact, slugify } from '../harvest-utils.js';

export async function harvestCuratedWebSource(env, source) {
  const db = env.BLUE_ARCHIVE;
  const headers = {
    'user-agent': 'LeedsBuzz-BizBot/1.0 (independent fan knowledge project; contact via leedsbuzz.biz)',
    'accept': 'text/html,application/xhtml+xml'
  };
  if (source.etag) headers['if-none-match'] = source.etag;
  if (source.last_modified) headers['if-modified-since'] = source.last_modified;

  const response = await fetch(source.url, { headers, redirect: 'follow' });
  if (response.status === 304) {
    await markSourceFetched(db, source, {});
    return { imported: 0, notModified: true };
  }
  if (!response.ok) throw new Error(`Web source returned ${response.status}: ${source.url}`);

  const html = await response.text();
  const plain = htmlToText(html).slice(0, 60000);
  const contentHash = hashString(plain);
  const documentId = `doc-${hashString(`${source.id}|${source.url}|${contentHash}`)}`;
  await db.prepare(`INSERT OR IGNORE INTO harvest_documents
    (id,source_id,url,title,content_hash,http_status,extract_status) VALUES (?,?,?,?,?,?,?)`)
    .bind(documentId, source.id, source.url, source.title, contentHash, response.status, env.AI ? 'pending-ai' : 'stored-no-ai').run();

  let imported = 0;
  imported += await importDeterministicOfficialStats(db, source, plain, html);

  if (env.AI && plain.length > 300) {
    const seen = new Set();
    for (const chunk of textChunks(plain, 15000).slice(0, 3)) {
      const facts = await extractFactsWithAI(env, source, chunk);
      for (const fact of facts) {
        const key = fact.claim_key || `${fact.entity_type}:${fact.entity_id}:${fact.title}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (await upsertKnowledgeFact(db, fact, source)) imported++;
      }
    }
    await db.prepare(`UPDATE harvest_documents SET extract_status=? WHERE id=?`).bind(`extracted-${imported}`, documentId).run();
  }

  await markSourceFetched(db, source, {
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified')
  });
  return { imported, documentId, charsRead: plain.length };
}

async function importDeterministicOfficialStats(db, source, text, html = '') {
  let imported = 0;
  if (source.id === 'official-leeds-goalscorers') {
    const rows = collectLeaderboard(text, /([A-ZÀ-Ž][A-Za-zÀ-ž.'’\- ]{2,60}?)\s*[–—-]\s*(\d{2,3})\s+goals\b/g);
    for (const { name, value } of rows.slice(0, 30)) {
      const slug = slugify(name);
      await db.prepare(`INSERT INTO players (id,slug,full_name,display_name,goals,is_current,true_blue_eligible,avatar_tier,updated_at)
        VALUES (?,?,?,?,?,0,0,'archive',CURRENT_TIMESTAMP)
        ON CONFLICT(slug) DO UPDATE SET goals=excluded.goals,full_name=excluded.full_name,display_name=excluded.display_name,updated_at=CURRENT_TIMESTAMP`)
        .bind(`official-${hashString(slug)}`, slug, name, name, value).run();
      const fact = {
        claim_key: `player:${slug}:leeds-goals`, title: `${name} Leeds United goals`,
        body: `${name} scored ${value} goals for Leeds United.`, fact_type: 'record', entity_type: 'player', entity_id: slug,
        tags: [slug, 'goals', 'record'], confidence: 0.99
      };
      if (await upsertKnowledgeFact(db, fact, source)) imported++;
    }
  }

  if (source.id === 'official-leeds-appearances') {
    const rows = collectLeaderboard(text, /([A-ZÀ-Ž][A-Za-zÀ-ž.'’\- ]{2,60}?)\s*[–—-]\s*(\d{2,3})\b/g)
      .filter(x => x.value >= 50 && x.value <= 1000);
    imported += await importAppearanceRows(db, source, rows, 0.99);
  }

  if (source.id === 'trusted-specialist-leeds-appearances') {
    const rows = extractSpecialistLeedsAppearanceRows(html, text);
    imported += await importAppearanceRows(db, source, rows, 0.92);
  }

  if (source.id === 'trusted-wikipedia-players') {
    const rows = extractWikipediaLeedsAppearanceRows(html);
    imported += await importAppearanceRows(db, source, rows, 0.90, 50);
  }
  return imported;
}

async function importAppearanceRows(db, source, rows, confidence, minimumAppearances = 50) {
  const unique = new Map();
  for (const row of rows || []) {
    const name = cleanPlayerName(row?.name);
    const value = Number(row?.value);
    if (!name || !Number.isFinite(value) || value < minimumAppearances || value > 1000) continue;
    const slug = slugify(name);
    const current = unique.get(slug);
    if (!current || value > current.value) unique.set(slug, { name, value, slug });
  }

  const entries = [...unique.values()].sort((a,b) => b.value - a.value || a.name.localeCompare(b.name));
  let imported = 0;
  for (let offset = 0; offset < entries.length; offset += 70) {
    const statements = [];
    for (const { name, value, slug } of entries.slice(offset, offset + 70)) {
      const thresholdMet=value>=50?1:0;
      statements.push(db.prepare(`INSERT INTO players (id,slug,full_name,display_name,appearances,is_current,true_blue_eligible,avatar_tier,updated_at)
        VALUES (?,?,?,?,?,0,?,CASE WHEN ?>=50 THEN 'archive' ELSE 'reference' END,CURRENT_TIMESTAMP)
        ON CONFLICT(slug) DO UPDATE SET
          appearances=CASE
            WHEN players.appearances IS NULL THEN excluded.appearances
            WHEN ?='A' THEN excluded.appearances
            ELSE MAX(players.appearances,excluded.appearances)
          END,
          true_blue_eligible=CASE WHEN excluded.appearances>=50 THEN 1 ELSE players.true_blue_eligible END,
          full_name=CASE WHEN players.full_name IS NULL OR players.full_name='' THEN excluded.full_name ELSE players.full_name END,
          display_name=CASE WHEN players.display_name IS NULL OR players.display_name='' THEN excluded.display_name ELSE players.display_name END,
          avatar_tier=CASE WHEN excluded.appearances>=50 THEN 'archive' ELSE players.avatar_tier END,updated_at=CURRENT_TIMESTAMP`)
        .bind(`appearance-${hashString(slug)}`, slug, name, name, value, thresholdMet, value, source.trust_tier || 'B'));
      statements.push(db.prepare(`INSERT OR REPLACE INTO player_sources (player_id,source_id,note)
        SELECT id,?,? FROM players WHERE slug=?`)
        .bind(source.id, `${value} Leeds United competitive first-team appearances; source checked automatically.`, slug));
      statements.push(db.prepare(`INSERT OR IGNORE INTO player_aliases (player_id,alias)
        SELECT id,? FROM players WHERE slug=?`)
        .bind(name, slug));
    }
    if (statements.length) await db.batch(statements);
  }

  // Keep one compact, source-tracked summary fact. Individual player totals remain
  // structured on the player records and linked through player_sources.
  if (entries.length) {
    const fact = {
      claim_key: `source:${source.id}:appearance-list`,
      title: 'Leeds United 50+ appearance player archive',
      body: `${entries.length} Leeds United player appearance totals at or above ${minimumAppearances} were imported from the source table.`,
      fact_type: 'archive-index', entity_type: 'club', entity_id: 'leeds',
      tags: ['appearances','players','white-vault','50-plus'], confidence
    };
    if (await upsertKnowledgeFact(db, fact, source)) imported++;
  }
  return imported + entries.length;
}

function extractSpecialistLeedsAppearanceRows(html, text) {
  const out = [];
  const seen = new Set();
  const source = String(html || '');
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(source)) !== null) {
    const cells = [];
    const cellRegex = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) cells.push(cleanHtmlCell(cellMatch[1]));
    if (cells.length < 2) continue;
    let valueIndex = -1, value = NaN;
    for (let i = cells.length - 1; i >= 0; i--) {
      const numeric = String(cells[i]).replace(/[^0-9]/g, '');
      if (/^\d{2,4}$/.test(numeric)) { valueIndex = i; value = Number(numeric); break; }
    }
    if (!Number.isFinite(value) || value < 50 || value > 1000) continue;
    let name = '';
    for (let i = valueIndex - 1; i >= 0; i--) {
      const candidate = cleanPlayerName(cells[i]);
      if (candidate && /[A-Za-zÀ-ž]/.test(candidate) && !/^#|rank|player|apps?|appearances?$/i.test(candidate)) { name = candidate; break; }
    }
    if (!name) continue;
    const key = `${slugify(name)}|${value}`;
    if (!seen.has(key)) { seen.add(key); out.push({ name, value }); }
  }

  // Fallback for mirrors or cached versions where the HTML table has already been flattened.
  if (!out.length) {
    const lineRegex = /^\s*\d{1,3}\s*\|\s*(.+?)\s*\|\s*(\d{2,3})\s*$/gm;
    let match;
    while ((match = lineRegex.exec(String(text || ''))) !== null) {
      const name = cleanPlayerName(match[1]);
      const value = Number(match[2]);
      if (name && value >= 50 && value <= 1000) out.push({ name, value });
    }
  }
  return out;
}

function extractWikipediaLeedsAppearanceRows(html) {
  const out = [];
  const seen = new Set();
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(String(html || ''))) !== null) {
    const cells = [];
    const cellRegex = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) cells.push(cleanHtmlCell(cellMatch[1]));
    if (cells.length < 5) continue;

    // Wikipedia's Leeds United player tables end with Starts/Subs/Total/Goals or
    // Total/Goals. The second-last ordinary integer is therefore the total.
    const numeric = [];
    for (let i = 0; i < cells.length; i++) {
      const compact = String(cells[i]).replace(/,/g, '').trim();
      if (/^\d{1,4}$/.test(compact)) numeric.push({ index:i, value:Number(compact) });
    }
    if (numeric.length < 2) continue;
    const totalCell = numeric[numeric.length - 2];
    const value = totalCell.value;
    if (!Number.isFinite(value) || value < 50 || value > 1000) continue;

    let name = '';
    for (let i = 0; i < Math.min(totalCell.index, 3); i++) {
      const candidate = cleanPlayerName(cells[i]);
      if (!candidate) continue;
      if (/^(player|nationality|pos|position|club career|starts|subs|total|goals|appearances)$/i.test(candidate)) continue;
      if (/^(england|scotland|wales|ireland|france|spain|italy|germany|brazil|argentina)$/i.test(candidate)) continue;
      name = candidate;
      break;
    }
    if (!name) continue;
    const key = slugify(name);
    if (!seen.has(key)) { seen.add(key); out.push({ name, value }); }
  }
  return out;
}

function cleanHtmlCell(value) {
  return decodeHtmlEntities(String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<span\b[^>]*(?:display\s*:\s*none|class=["'][^"']*sortkey)[^>]*>[\s\S]*?<\/span>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function cleanPlayerName(value) {
  const name = decodeHtmlEntities(String(value || ''))
    .replace(/\([^)]*(?:captain|player-manager|current)[^)]*\)/gi, ' ')
    .replace(/[†‡*]+/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/^[#\d.\s]+/, '')
    .replace(/\s+\d+$/, '')
    .trim();
  if (name.length < 2 || name.length > 90 || /\d/.test(name)) return '';
  return name;
}

function decodeHtmlEntities(value) {
  const named = { amp:'&', quot:'"', apos:"'", nbsp:' ', ndash:'–', mdash:'—', rsquo:'’', lsquo:'‘', eacute:'é', Eacute:'É' };
  return String(value || '').replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]+);/gi, (_, token) => {
    if (token[0] === '#') {
      const hex = token[1]?.toLowerCase() === 'x';
      const code = parseInt(token.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    }
    return named[token] ?? named[token.toLowerCase()] ?? '';
  });
}

async function extractFactsWithAI(env, source, text) {
  const prompt = `You are extracting factual Leeds United Football Club knowledge for a source-tracked database.
Source title: ${source.title}
Publisher: ${source.publisher || 'Unknown'}
Trust tier: ${source.trust_tier}
URL: ${source.url}

RULES:
- Return ONLY a JSON array. No markdown.
- Extract up to 25 discrete factual claims explicitly supported by the supplied page text.
- Paraphrase; do not copy long sentences or copyrighted prose.
- Prefer dates, records, totals, names, results, milestones, roles, managers, trophies and historical facts.
- Never infer a fact that is not stated.
- If the page text is unusable, return [].
- Each object must use exactly: claim_key,title,body,fact_type,entity_type,entity_id,tags,confidence.
- claim_key must be stable lowercase, e.g. "player:peter-lorimer:leeds-goals".
- entity_type: player, manager, match, season, competition, record, club, stadium or history.
- entity_id should be a lowercase slug where possible, otherwise "leeds".
- tags should be an array of short lowercase keywords.
- confidence must be 0 to 1.

PAGE TEXT:
${text}`;
  const result = await env.AI.run(env.AI_MODEL || '@cf/meta/llama-3.1-8b-instruct-fp8-fast', { prompt });
  const raw = extractText(result);
  const json = extractJSONArray(raw);
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter(f => f && f.title && f.body).slice(0, 25) : [];
  } catch {
    return [];
  }
}

function collectLeaderboard(text, regex) {
  const out = [], seen = new Set();
  let m;
  while ((m = regex.exec(text)) !== null) {
    const name = String(m[1] || '').trim().replace(/\s+/g, ' ');
    const value = Number(m[2]);
    const key = `${name.toLowerCase()}|${value}`;
    if (!name || !Number.isFinite(value) || seen.has(key)) continue;
    seen.add(key); out.push({ name, value });
  }
  return out;
}
function textChunks(text, size) { const out=[]; for(let i=0;i<text.length;i+=size) out.push(text.slice(i,i+size)); return out; }
function extractText(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (typeof result.response === 'string') return result.response;
  if (typeof result.result === 'string') return result.result;
  if (Array.isArray(result.choices) && result.choices[0]?.message?.content) return String(result.choices[0].message.content);
  return '';
}
function extractJSONArray(raw) {
  const cleaned = String(raw || '').replace(/```json|```/gi, '').trim();
  const start = cleaned.indexOf('['), end = cleaned.lastIndexOf(']');
  return start >= 0 && end > start ? cleaned.slice(start, end + 1) : '';
}
function htmlToText(html) {
  return decodeHtmlEntities(String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|section|article)>/gi, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .split(/\n+/)
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}
