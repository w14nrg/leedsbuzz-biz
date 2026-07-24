export const HISTORY_SOURCES = {
  "history": {
    "label": "Leeds United — Club history",
    "url": "https://www.leedsunited.com/en/club",
    "tier": "Official club"
  },
  "honours": {
    "label": "Leeds United — Honours",
    "url": "https://www.leedsunited.com/en/club-honours",
    "tier": "Official club"
  },
  "squad": {
    "label": "Leeds United — Men’s squad",
    "url": "https://www.leedsunited.com/en/teams/men",
    "tier": "Official club"
  },
  "players": {
    "label": "List of Leeds United F.C. players",
    "url": "https://en.wikipedia.org/wiki/List_of_Leeds_United_F.C._players",
    "tier": "Reference archive"
  },
  "club": {
    "label": "Leeds United F.C.",
    "url": "https://en.wikipedia.org/wiki/Leeds_United_F.C.",
    "tier": "Reference archive"
  }
};

export const ERAS = [
  {
    "id": "foundation",
    "start": 1919,
    "end": 1960,
    "label": "FOUNDATION",
    "title": "A new club rises from the city",
    "description": "Leeds United are formed in 1919, enter the Football League and move between the top two divisions while building Elland Road traditions."
  },
  {
    "id": "revie-rise",
    "start": 1961,
    "end": 1967,
    "label": "REVIE’S RISE",
    "title": "Promotion and a new identity",
    "description": "Don Revie reshapes the club, wins promotion and builds the side that will dominate English football."
  },
  {
    "id": "golden",
    "start": 1968,
    "end": 1975,
    "label": "THE GOLDEN ERA",
    "title": "Champions, cup winners and European finalists",
    "description": "A legendary side wins major honours at home and abroad and becomes one of Europe’s strongest teams."
  },
  {
    "id": "rebuild",
    "start": 1976,
    "end": 1989,
    "label": "REBUILDING",
    "title": "Change, relegation and the road back",
    "description": "Leeds adjust after the Revie era, fall into the Second Division and work towards a return."
  },
  {
    "id": "wilkinson",
    "start": 1990,
    "end": 1996,
    "label": "WILKINSON",
    "title": "Back on top of England",
    "description": "Promotion in 1990 is followed by the 1991/92 league championship and a new generation of Elland Road heroes."
  },
  {
    "id": "europe",
    "start": 1997,
    "end": 2004,
    "label": "EUROPEAN NIGHTS",
    "title": "A young side reaches Europe’s final four",
    "description": "Leeds challenge near the top of the Premier League and reach UEFA Cup and Champions League semi-finals."
  },
  {
    "id": "lower-leagues",
    "start": 2005,
    "end": 2017,
    "label": "THE LONG ROAD",
    "title": "Administration, League One and resilience",
    "description": "The club endures financial crisis and a spell in the third tier before rebuilding its Championship status."
  },
  {
    "id": "bielsa",
    "start": 2018,
    "end": 2022,
    "label": "BIELSA",
    "title": "Belief, promotion and Premier League return",
    "description": "Marcelo Bielsa transforms the football and reconnects the club with supporters, winning the 2019/20 Championship."
  },
  {
    "id": "now",
    "start": 2023,
    "end": 2026,
    "label": "BACK AGAIN",
    "title": "Relegation, recovery and another title",
    "description": "Leeds regroup, win the 2024/25 Championship and return to the Premier League."
  }
];

export const TIMELINE_EVENTS = [
  {
    "id": "founded",
    "year": 1919,
    "date": "17 October 1919",
    "title": "Leeds United is formed",
    "type": "club",
    "era": "foundation",
    "featured": true,
    "summary": "Leeds United is established following the disbanding of Leeds City.",
    "source": "club"
  },
  {
    "id": "league-entry",
    "year": 1920,
    "date": "1920",
    "title": "Elected to the Football League",
    "type": "club",
    "era": "foundation",
    "featured": false,
    "summary": "The new club enters the Football League Second Division.",
    "source": "club"
  },
  {
    "id": "first-title",
    "year": 1924,
    "date": "1923/24",
    "title": "Second Division champions",
    "type": "trophy",
    "era": "foundation",
    "featured": true,
    "summary": "Leeds win their first major honour and earn promotion to the First Division.",
    "source": "honours"
  },
  {
    "id": "revie",
    "year": 1961,
    "date": "March 1961",
    "title": "Don Revie becomes manager",
    "type": "manager",
    "era": "revie-rise",
    "featured": true,
    "summary": "Revie begins the transformation that creates the club’s defining team and culture.",
    "source": "club"
  },
  {
    "id": "promotion-1964",
    "year": 1964,
    "date": "1963/64",
    "title": "Champions and promoted",
    "type": "trophy",
    "era": "revie-rise",
    "featured": true,
    "summary": "Leeds win the Second Division and return to the top flight.",
    "source": "honours"
  },
  {
    "id": "double-1968",
    "year": 1968,
    "date": "1967/68",
    "title": "League Cup and Inter-Cities Fairs Cup",
    "type": "trophy",
    "era": "golden",
    "featured": true,
    "summary": "Leeds collect their first major domestic cup and first European trophy.",
    "source": "honours"
  },
  {
    "id": "champions-1969",
    "year": 1969,
    "date": "1968/69",
    "title": "Champions of England",
    "type": "trophy",
    "era": "golden",
    "featured": true,
    "summary": "Revie’s side wins the First Division title for the first time.",
    "source": "honours"
  },
  {
    "id": "fairs-1971",
    "year": 1971,
    "date": "1970/71",
    "title": "Fairs Cup winners again",
    "type": "trophy",
    "era": "golden",
    "featured": true,
    "summary": "Leeds secure a second Inter-Cities Fairs Cup.",
    "source": "honours"
  },
  {
    "id": "fa-cup-1972",
    "year": 1972,
    "date": "6 May 1972",
    "title": "FA Cup winners",
    "type": "trophy",
    "era": "golden",
    "featured": true,
    "summary": "Allan Clarke scores as Leeds beat Arsenal at Wembley.",
    "source": "honours"
  },
  {
    "id": "champions-1974",
    "year": 1974,
    "date": "1973/74",
    "title": "Champions again",
    "type": "trophy",
    "era": "golden",
    "featured": true,
    "summary": "Leeds open the league season with a 29-match unbeaten run and win the title.",
    "source": "honours"
  },
  {
    "id": "european-final-1975",
    "year": 1975,
    "date": "28 May 1975",
    "title": "European Cup final",
    "type": "match",
    "era": "golden",
    "featured": false,
    "summary": "Leeds reach the European Cup final against Bayern Munich in Paris.",
    "source": "club"
  },
  {
    "id": "promotion-1990",
    "year": 1990,
    "date": "1989/90",
    "title": "Second Division champions",
    "type": "trophy",
    "era": "wilkinson",
    "featured": true,
    "summary": "Howard Wilkinson leads Leeds back to the top flight.",
    "source": "honours"
  },
  {
    "id": "champions-1992",
    "year": 1992,
    "date": "1991/92",
    "title": "Champions of England",
    "type": "trophy",
    "era": "wilkinson",
    "featured": true,
    "summary": "Leeds win the final First Division championship before the Premier League begins.",
    "source": "honours"
  },
  {
    "id": "uefa-semi-2000",
    "year": 2000,
    "date": "1999/2000",
    "title": "UEFA Cup semi-final",
    "type": "season",
    "era": "europe",
    "featured": false,
    "summary": "A young Leeds side reaches the UEFA Cup semi-finals.",
    "source": "club"
  },
  {
    "id": "ucl-semi-2001",
    "year": 2001,
    "date": "2000/01",
    "title": "Champions League semi-final",
    "type": "season",
    "era": "europe",
    "featured": true,
    "summary": "Leeds produce a memorable European campaign and reach the last four.",
    "source": "club"
  },
  {
    "id": "relegation-2004",
    "year": 2004,
    "date": "2003/04",
    "title": "Relegated from the Premier League",
    "type": "season",
    "era": "lower-leagues",
    "featured": false,
    "summary": "Financial crisis culminates in relegation after fourteen top-flight seasons.",
    "source": "club"
  },
  {
    "id": "league-one-2007",
    "year": 2007,
    "date": "2007",
    "title": "Administration and League One",
    "type": "club",
    "era": "lower-leagues",
    "featured": false,
    "summary": "Leeds enter administration and begin the next season in the third tier with a points deduction.",
    "source": "club"
  },
  {
    "id": "old-trafford-2010",
    "year": 2010,
    "date": "3 January 2010",
    "title": "FA Cup victory at Old Trafford",
    "type": "match",
    "era": "lower-leagues",
    "featured": false,
    "summary": "Jermaine Beckford scores as League One Leeds eliminate Manchester United.",
    "source": "club"
  },
  {
    "id": "promotion-2010",
    "year": 2010,
    "date": "2009/10",
    "title": "Promoted to the Championship",
    "type": "season",
    "era": "lower-leagues",
    "featured": false,
    "summary": "Leeds beat Bristol Rovers on the final day to leave League One.",
    "source": "club"
  },
  {
    "id": "bielsa-arrives",
    "year": 2018,
    "date": "June 2018",
    "title": "Marcelo Bielsa appointed",
    "type": "manager",
    "era": "bielsa",
    "featured": true,
    "summary": "A transformative coaching era begins at Elland Road.",
    "source": "club"
  },
  {
    "id": "champions-2020",
    "year": 2020,
    "date": "2019/20",
    "title": "Championship champions",
    "type": "trophy",
    "era": "bielsa",
    "featured": true,
    "summary": "Leeds return to the Premier League after sixteen years away.",
    "source": "honours"
  },
  {
    "id": "relegation-2023",
    "year": 2023,
    "date": "2022/23",
    "title": "Relegated to the Championship",
    "type": "season",
    "era": "now",
    "featured": false,
    "summary": "Leeds drop out of the Premier League and begin another rebuild.",
    "source": "club"
  },
  {
    "id": "champions-2025",
    "year": 2025,
    "date": "2024/25",
    "title": "Championship champions",
    "type": "trophy",
    "era": "now",
    "featured": true,
    "summary": "Leeds win the Championship and return to the Premier League.",
    "source": "honours"
  }
];

export const TROPHIES = [
  {
    "id": "league",
    "group": "domestic",
    "name": "English league title",
    "count": 3,
    "icon": "♛",
    "seasons": [
      "1968/69",
      "1973/74",
      "1991/92"
    ],
    "source": "honours"
  },
  {
    "id": "fa-cup",
    "group": "domestic",
    "name": "FA Cup",
    "count": 1,
    "icon": "🏆",
    "seasons": [
      "1971/72"
    ],
    "source": "honours"
  },
  {
    "id": "league-cup",
    "group": "domestic",
    "name": "League Cup",
    "count": 1,
    "icon": "◇",
    "seasons": [
      "1967/68"
    ],
    "source": "honours"
  },
  {
    "id": "charity-shield",
    "group": "heritage",
    "name": "FA Charity Shield",
    "count": 2,
    "icon": "✦",
    "seasons": [
      "1969",
      "1992"
    ],
    "source": "honours"
  },
  {
    "id": "second-tier",
    "group": "heritage",
    "name": "Second Division / Championship title",
    "count": 5,
    "icon": "▲",
    "seasons": [
      "1923/24",
      "1963/64",
      "1989/90",
      "2019/20",
      "2024/25"
    ],
    "source": "honours"
  },
  {
    "id": "fairs-cup",
    "group": "europe",
    "name": "Inter-Cities Fairs Cup",
    "count": 2,
    "icon": "★",
    "seasons": [
      "1967/68",
      "1970/71"
    ],
    "source": "honours"
  }
];

export const GOAL_LEADERS = [
  {
    "rank": 1,
    "name": "Peter Lorimer",
    "slug": "peter-lorimer",
    "value": 238
  },
  {
    "rank": 2,
    "name": "John Charles",
    "slug": "john-charles",
    "value": 157
  },
  {
    "rank": 3,
    "name": "Allan Clarke",
    "slug": "allan-clarke",
    "value": 151
  },
  {
    "rank": 4,
    "name": "Tom Jennings",
    "slug": "tom-jennings",
    "value": 117
  },
  {
    "rank": 5,
    "name": "Billy Bremner",
    "slug": "billy-bremner",
    "value": 115
  },
  {
    "rank": 6,
    "name": "Johnny Giles",
    "slug": "johnny-giles",
    "value": 114
  },
  {
    "rank": 7,
    "name": "Mick Jones",
    "slug": "mick-jones",
    "value": 111
  },
  {
    "rank": 8,
    "name": "Charlie Keetley",
    "slug": "charlie-keetley",
    "value": 110
  },
  {
    "rank": 9,
    "name": "Russell Wainscoat",
    "slug": "russell-wainscoat",
    "value": 93
  },
  {
    "rank": 10,
    "name": "Luciano Becchio",
    "slug": "luciano-becchio",
    "value": 86
  }
];

export const CLUB_RECORDS = [
  {
    "label": "Most Leeds appearances",
    "value": "773",
    "holder": "Jack Charlton",
    "slug": "jack-charlton",
    "note": "1952–1973",
    "source": "players"
  },
  {
    "label": "Most Leeds goals",
    "value": "238",
    "holder": "Peter Lorimer",
    "slug": "peter-lorimer",
    "note": "Across two spells",
    "source": "players"
  },
  {
    "label": "English league titles",
    "value": "3",
    "holder": "Leeds United",
    "slug": null,
    "note": "1968/69, 1973/74 and 1991/92",
    "source": "honours"
  },
  {
    "label": "Inter-Cities Fairs Cups",
    "value": "2",
    "holder": "Leeds United",
    "slug": null,
    "note": "1967/68 and 1970/71",
    "source": "honours"
  },
  {
    "label": "Longest unbeaten league start",
    "value": "29",
    "holder": "1973/74 side",
    "slug": null,
    "note": "Opening league matches",
    "source": "club"
  }
];
