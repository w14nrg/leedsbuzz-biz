-- LeedsBuzz.biz starter seed.
-- This deliberately small, verified core proves the archive and provenance system.
-- The Worker harvesters and curated White Vault datasets expand it from trusted sources.

INSERT OR IGNORE INTO sources (id,title,publisher,url,published_at,source_type,verified) VALUES
('src-leeds-club-history','Leeds United club history','Leeds United Football Club','https://www.leedsunited.com/en/club',NULL,'official-club',1),
('src-leeds-honours','Leeds United club honours','Leeds United Football Club','https://www.leedsunited.com/en/club-honours',NULL,'official-club',1),
('src-leeds-player-list','List of Leeds United F.C. players','Wikipedia','https://en.wikipedia.org/wiki/List_of_Leeds_United_F.C._players',NULL,'reference',1),
('src-leeds-squad','Leeds United men''s first team','Leeds United Football Club','https://www.leedsunited.com/en/teams/men',NULL,'official-club',1);

INSERT OR IGNORE INTO players
(id,slug,full_name,display_name,nationality,primary_position,appearances,goals,is_current,true_blue_eligible,avatar_tier)
VALUES
('jack-charlton','jack-charlton','John Charlton','Jack Charlton','England','Centre-back',773,96,0,1,'bespoke'),
('billy-bremner','billy-bremner','William John Bremner','Billy Bremner','Scotland','Midfielder',772,115,0,1,'bespoke'),
('peter-lorimer','peter-lorimer','Peter Patrick Lorimer','Peter Lorimer','Scotland','Winger / midfielder',705,238,0,1,'bespoke'),
('ethan-ampadu','ethan-ampadu','Ethan Kwame Colm Raymond Ampadu','Ethan Ampadu','Wales','Defensive midfielder',126,3,1,1,'current');

INSERT OR IGNORE INTO player_aliases (player_id,alias) VALUES
('jack-charlton','Big Jack'),
('billy-bremner','King Billy'),
('peter-lorimer','Lash');

INSERT OR IGNORE INTO player_sources (player_id,source_id,note) VALUES
('jack-charlton','src-leeds-player-list','Club appearance and goals record'),
('billy-bremner','src-leeds-player-list','Club appearance and goals record'),
('peter-lorimer','src-leeds-player-list','Club appearance and goals record'),
('ethan-ampadu','src-leeds-squad','Current first-team squad status');

INSERT OR IGNORE INTO knowledge_chunks
(id,title,body,fact_type,entity_type,entity_id,tags,source_id,verified)
VALUES
('fact-founded-1919','Leeds United founded in 1919','Leeds United Football Club was formed in 1919 and was elected to the Football League in 1920.','history','club','leeds','founded,1919,football league,history','src-leeds-club-history',1),
('fact-charlton-appearances','Jack Charlton appearance record','Jack Charlton made a club-record 773 competitive appearances for Leeds United.','record','player','jack-charlton','jack charlton,appearances,record,defender','src-leeds-player-list',1),
('fact-bremner-record','Billy Bremner Leeds record','Billy Bremner made 772 appearances and scored 115 goals for Leeds United.','record','player','billy-bremner','billy bremner,appearances,goals,captain','src-leeds-player-list',1),
('fact-lorimer-goals','Peter Lorimer goals record','Peter Lorimer scored a club-record 238 competitive goals in 705 appearances for Leeds United.','record','player','peter-lorimer','peter lorimer,goals,record,appearances','src-leeds-player-list',1),
('fact-1969-title','Leeds United won the 1968–69 league title','Leeds United won the English league championship for the first time in the 1968–69 season.','honour','club','leeds','1968-69,league title,champions,don revie','src-leeds-honours',1),
('fact-1972-fa-cup','Leeds United won the 1972 FA Cup','Leeds United won the FA Cup in 1972, defeating Arsenal in the final at Wembley.','honour','club','leeds','1972,fa cup,arsenal,wembley','src-leeds-honours',1);

INSERT OR IGNORE INTO records
(id,title,category,holder_type,holder_id,value_text,source_id,verified)
VALUES
('record-alltime-appearances','Leeds United all-time appearance record','player appearances','player','jack-charlton','773 appearances','src-leeds-player-list',1),
('record-alltime-goals','Leeds United all-time leading goalscorer','player goals','player','peter-lorimer','238 goals','src-leeds-player-list',1);
