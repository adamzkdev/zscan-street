/**
 * What the people working in each place know about it: the real history of the landmark it is
 * modelled on, and the ZStreet twist. Fed to the chat as facts, so characters can tell the story
 * with a wink. Keep it accurate; the jokes are about ZStreet, not invented history.
 */
export const PLACE_LORE: Record<string, string> = {
  prison:
    "Real history: Alcatraz Island in San Francisco Bay was a military fort, then a military prison, and a federal penitentiary from 1934 to 1963. Famous inmates: Al Capone, George 'Machine Gun' Kelly, Robert Stroud (the 'Birdman of Alcatraz'). In June 1962 Frank Morris and the brothers John and Clarence Anglin escaped on a raft made of raincoats, with papier-mâché heads left in their beds; they were never found. The cold currents of the bay made escape nearly impossible. It closed in 1963 because it was too expensive to run. Broadway is the main corridor between B and C blocks; D block held isolation cells. ZStreet twist (joke about it): the city moved its biggest crypto falls here, e.g. 'we had to bring SBF out to the Rock, he kept dumping the market from his cell'; CZ only stayed four months and keeps saying funds are SAFU; BitConnect still shouts in the yard. Stick to the public record about real people (convictions and sentences only), never invent crimes.",
  museum:
    "Real history: the Louvre in Paris was a royal palace before it opened as a museum in 1793. The glass pyramid by architect I. M. Pei opened in 1989 as the main entrance (Hall Napoléon below it). The Grande Galerie is one of the longest rooms in the world; the Mona Lisa hangs in the Salle des États behind bulletproof glass; the Winged Victory of Samothrace stands at the top of the Daru staircase. ZStreet twist: here the paintings are the 10,000 zkSNARKs, and the 'Mona Lisa' is zkSNARK #1, the collection's original; visitors still can't see it for all the phones.",
  stadium:
    "Block Stadium is ZStreet's football ground. Every Zcash block is a match: its shielded transactions play for Shielded (gold), its transparent ones for Transparent (silver); the side with more wins the block and scores. The crowd sings 'SHIELD-ED!'. Visitors can watch from the stands or go down and play as Shielded's number 9.",
  colosseum:
    "Real history: the Colosseum (Flavian Amphitheatre) in Rome was opened in 80 AD under Emperor Titus and held around 50,000 spectators for gladiator fights and animal hunts; the hypogeum underneath had lifts and trapdoors to bring fighters and beasts up to the arena. Earthquakes and stone robbers ruined its south side. ZStreet twist: it now hosts the Proof Games, one bout per block, a Shielded gladiator against a Transparent one; the emperor gives thumbs up or down.",
  eiffel:
    "Real history: Gustave Eiffel's company built the tower for the 1889 World's Fair in Paris; about 18,000 iron parts and 2.5 million rivets; 330 m tall today with antennas, the tallest structure in the world until 1930. It was meant to be dismantled after 20 years but was saved by its radio antennas. Eiffel kept a small apartment at the top where he received Thomas Edison. It is repainted every 7 years. ZStreet twist: the telescopes on the platforms show live chain data.",
  pyramid:
    "Real history: the Great Pyramid of Giza was built for Pharaoh Khufu around 2560 BC, originally about 146 m tall, made of some 2.3 million stone blocks; it was the tallest building on Earth for nearly 3,800 years. Inside: the Grand Gallery climbing to the King's Chamber with its granite sarcophagus. The Sphinx guards the plateau. ZStreet twist: the inside is a labyrinth with five golden ⓩ coins to find and, in the King's Chamber, the treasure of the genesis block (Zcash block 0, October 2016).",
  needle:
    "Inspired by the Burj Khalifa in Dubai (828 m, opened in 2010, the tallest building in the world, with its 'At the Top' observation decks). The ZEC Needle is ZStreet's tallest tower at about 164 m, with decks at 82, 120 and 150 m. The lobby's history wall tells Zcash's story from the genesis block in October 2016 through the network upgrades (Overwinter, Sapling, Blossom, Heartwood, Canopy, NU5 with Orchard, NU6).",
  hotel:
    "Inspired by Marina Bay Sands in Singapore (opened 2010): three 55-storey towers joined by the SkyPark, with a 150 m infinity pool on the roof. The Marina ZEC Hotel has a casino whose jackpot is the block reward, suites with a view of the city and the SkyPark pool; fireworks over the bay on every block.",
  mall:
    "Inspired by Singapore: Jewel Changi Airport's Rain Vortex (the world's tallest indoor waterfall, about 40 m, opened 2019) and the canal with sampan boats at The Shoppes at Marina Bay Sands. The ZK Mall has five levels: luxury shops on the canal, fashion, tech and toys, a hawker centre, and the ZK Cinema with an arcade.",
  reserve:
    "The ZEC Reserve is ZStreet's central bank on Wall Street, a granite temple in front of a glass tower, like the New York Stock Exchange and the Federal Reserve Bank of New York (whose vault, 24 m below Manhattan, holds one of the world's biggest gold stores). Its vault holds the value pools, counted to the zatoshi; the bronze statue outside is a charging zebra (Zcash's mascot), not a bull.",
  bank: "The View Key Bank is a small downtown branch: visitors paste a viewing key and the vault shows their shielded balance, computed in their own browser; the key never leaves it.",
  opera:
    "Real history: the Sydney Opera House, designed by Danish architect Jørn Utzon, opened in 1973 on Bennelong Point; its roof 'sails' are covered with over a million cream and white tiles; Utzon left the project in 1966 before it was finished. The Concert Hall has a huge pipe organ. ZStreet twist: the orchestra plays the chain, a crescendo on every block.",
  bigben:
    "Real history: Big Ben is the nickname of the Great Bell (about 13.7 tonnes) in the Elizabeth Tower (named in 2012) at the Palace of Westminster in London; the clock started in 1859; the tower is about 96 m tall with 334 steps to the belfry; the clock is regulated with old pennies on the pendulum. ZStreet twist: the bell strikes on every new block.",
  statue:
    "Real history: the Statue of Liberty, by sculptor Frédéric Auguste Bartholdi, was a gift from France, dedicated in 1886 on Liberty Island in New York Harbor; its iron skeleton was designed by Gustave Eiffel (the same Eiffel); copper skin turned green over time; 354 steps up to the crown. ZStreet twist: here Liberty is zkSNARK #1, holding a golden ⓩ torch and a tablet reading 'ZIP 32'; privacy is liberty.",
  arab: "Inspired by the Burj Al Arab in Dubai: a 321 m sail-shaped hotel on its own artificial island, opened in 1999, famous for its gold-leaf atrium (one of the tallest in the world), its duplex suites, the helipad where Roger Federer and Andre Agassi played tennis in 2005, and its underwater-themed restaurant. Often called the world's only 'seven-star' hotel (a marketing nickname). Next to it, the Palm Jumeirah is an artificial palm-shaped island of villas on its fronds. ZStreet twist: the Burj Al ZEC's guests pay in shielded ZEC, the concierge never asks who you are.",
  mempool: "The MEMPOOL shop holds every pending Zcash transaction as a parcel; trucks bring them in, zkSNARKs pick them up and take them to the bus or metro of their block.",
  factory: "The Proof Factory is the mining hall: rows of miners press each new block, which rolls down the conveyor.",
  cards: "zkCARDS is the shop of the zkSNARKs collection.",
  library: "The Library keeps the Zcash news and every ZIP (Zcash Improvement Proposal).",
  tower: "ZK TOWER is a condo tower with flats, an arcade, a bowling alley, a gym, a pool and a rooftop.",
  zsa: "The ZSA Exchange is a building site for Zcash Shielded Assets (ZIPs 226, 227, 228), coming in a future upgrade.",
};

/** How every character speaks. */
export const VOICE =
  "Always answer in English only, whatever language the visitor writes in. Stay in character, short and lively (2-4 sentences), with a light sense of humour. When asked about the place you are in, tell its real history and best stories, then add the ZStreet twist with a wink. Never invent facts about real people beyond the public record.";
