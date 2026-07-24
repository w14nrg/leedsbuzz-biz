import { getState, setState, slugify } from '../harvest-utils.js';

const ENDPOINT='https://query.wikidata.org/sparql';
const PAGE_SIZE=150;
export async function harvestWikidataPlayers(env){
  const db=env.BLUE_ARCHIVE;let offset=Number(await getState(db,'wikidata.players.offset','0'))||0;
  const query=`SELECT ?player ?playerLabel (SAMPLE(?birth) AS ?birthDate) (GROUP_CONCAT(DISTINCT ?countryLabel; separator=", ") AS ?nationality) (GROUP_CONCAT(DISTINCT ?positionLabel; separator=", ") AS ?position) WHERE { ?player wdt:P31 wd:Q5 ; wdt:P54 wd:Q1128631 . OPTIONAL {?player wdt:P569 ?birth.} OPTIONAL {?player wdt:P27 ?country.} OPTIONAL {?player wdt:P413 ?position.} SERVICE wikibase:label {bd:serviceParam wikibase:language "en". ?player rdfs:label ?playerLabel. ?country rdfs:label ?countryLabel. ?position rdfs:label ?positionLabel.}} GROUP BY ?player ?playerLabel ORDER BY ?player LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
  const response=await fetch(`${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`,{headers:{accept:'application/sparql-results+json','user-agent':'LeedsBuzz/2.0 (independent supporter archive; leedsbuzz.biz)'}});if(!response.ok)throw new Error(`Wikidata returned ${response.status}`);const rows=(await response.json())?.results?.bindings||[];
  if(!rows.length){await setState(db,'wikidata.players.offset','0');await setState(db,'wikidata.players.last_complete_cycle',new Date().toISOString());return{imported:0,cycleComplete:true};}
  let imported=0;
  for(const row of rows){const qid=idFromUri(row.player?.value),name=clean(row.playerLabel?.value);if(!qid||!name)continue;const slug=slugify(name);await db.batch([
    db.prepare(`INSERT INTO players(id,slug,full_name,display_name,birth_date,nationality,primary_position,is_current,true_blue_eligible,avatar_tier,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(slug) DO UPDATE SET full_name=excluded.full_name,display_name=excluded.display_name,birth_date=COALESCE(players.birth_date,excluded.birth_date),nationality=COALESCE(players.nationality,excluded.nationality),primary_position=COALESCE(players.primary_position,excluded.primary_position),updated_at=CURRENT_TIMESTAMP`).bind(`wd-${qid.toLowerCase()}`,slug,name,name,normaliseDate(row.birthDate?.value),clean(row.nationality?.value),clean(row.position?.value),0,0,'archive'),
    db.prepare(`INSERT INTO external_entities(source_key,external_id,entity_type,entity_id,label,raw_json,first_seen_at,last_seen_at) VALUES('wikidata',?,'player-slug',?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(source_key,external_id) DO UPDATE SET entity_id=excluded.entity_id,label=excluded.label,raw_json=excluded.raw_json,last_seen_at=CURRENT_TIMESTAMP`).bind(qid,slug,name,JSON.stringify({qid}))
  ]);imported++;}
  offset+=rows.length;await setState(db,'wikidata.players.offset',String(offset));return{imported,offset,pageSize:PAGE_SIZE};
}
function idFromUri(uri=''){return String(uri).match(/\/(Q\d+)$/i)?.[1]?.toUpperCase()||''}function clean(v){return String(v||'').trim()||null}function normaliseDate(v){return String(v||'').match(/^(\d{4}-\d{2}-\d{2})/)?.[1]||null}
