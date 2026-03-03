import { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ══════════════════════════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════════════════════════ */

const REGIONS = {
  global:        { label:"🌍 Global",         center:[25,10],    zoom:2, bbox:null },
  north_america: { label:"🇺🇸 North America",  center:[45,-100],  zoom:3, bbox:{lamin:15,lomin:-168,lamax:72,lomax:-52} },
  europe:        { label:"🇪🇺 Europe",         center:[51,12],    zoom:4, bbox:{lamin:34,lomin:-25,lamax:72,lomax:50} },
  asia_pacific:  { label:"🌏 Asia-Pacific",    center:[20,130],   zoom:3, bbox:{lamin:-50,lomin:60,lamax:55,lomax:180} },
  middle_east:   { label:"🌙 Middle East",     center:[27,45],    zoom:4, bbox:{lamin:10,lomin:25,lamax:45,lomax:65} },
  latin_america: { label:"🌎 Latin America",   center:[-15,-65],  zoom:3, bbox:{lamin:-55,lomin:-120,lamax:30,lomax:-35} },
  africa:        { label:"🌍 Africa",          center:[0,20],     zoom:3, bbox:{lamin:-35,lomin:-20,lamax:38,lomax:55} },
};

const EMERGENCY_SQUAWKS = { "7700":"GENERAL EMERGENCY","7600":"RADIO FAILURE","7500":"HIJACK ALERT" };
const SQUAWK_COLORS     = { "7700":"#ff4444","7600":"#ff9900","7500":"#cc0000" };

const SEVERITY_META = {
  critical:{ color:"#ff2222",dim:"#3b000a",label:"CRITICAL" },
  high:    { color:"#ff5533",dim:"#2d0f00",label:"HIGH"     },
  medium:  { color:"#ffb300",dim:"#2d1f00",label:"MEDIUM"   },
  low:     { color:"#22dd77",dim:"#002d15",label:"LOW"       },
};

const EVENT_META = {
  accident:{ icon:"💥",color:"#ff2222",label:"Accident" },
  incident:{ icon:"⚠️", color:"#ffb300",label:"Incident" },
  military:{ icon:"✦", color:"#4488ff",label:"Military" },
  vip:     { icon:"★", color:"#cc88ff",label:"VIP/Gov"  },
  acars:   { icon:"📡", color:"#00e5ff",label:"ACARS"    },
};

const AIRCRAFT_CATEGORIES = [
  "All Types","Commercial Jet","Widebody Heavy","Narrowbody","Turboprop",
  "Cargo","Private/GA","Helicopter","Military","UAV/Drone",
];

const CARRIERS = [
  "All Carriers","American Airlines","Delta Air Lines","United Airlines","Southwest Airlines",
  "Alaska Airlines","JetBlue Airways","Spirit Airlines","Frontier Airlines",
  "British Airways","Lufthansa","Air France","KLM","Ryanair","EasyJet",
  "Emirates","Qatar Airways","Etihad Airways","Singapore Airlines",
  "Cathay Pacific","Japan Airlines","ANA","Korean Air",
  "Turkish Airlines","Aeroflot","Air Canada","LATAM Airlines",
  "FedEx Express","UPS Airlines","DHL Aviation","Atlas Air",
];

// ICAO 3-letter airline designators → carrier name
// Used to match live ADS-B callsigns (e.g. "AAL123") to carrier filter
const CARRIER_CALLSIGN_MAP = {
  "AAL":"American Airlines","DAL":"Delta Air Lines","UAL":"United Airlines",
  "SWA":"Southwest Airlines","ASA":"Alaska Airlines","JBU":"JetBlue Airways",
  "NKS":"Spirit Airlines",  "FFT":"Frontier Airlines","BAW":"British Airways",
  "DLH":"Lufthansa",        "AFR":"Air France",      "KLM":"KLM",
  "RYR":"Ryanair",          "EZY":"EasyJet",         "UAE":"Emirates",
  "QTR":"Qatar Airways",    "ETD":"Etihad Airways",  "SIA":"Singapore Airlines",
  "CPA":"Cathay Pacific",   "JAL":"Japan Airlines",  "ANA":"ANA",
  "KAL":"Korean Air",       "THY":"Turkish Airlines","AFL":"Aeroflot",
  "ACA":"Air Canada",       "LAM":"LATAM Airlines",  "LAN":"LATAM Airlines",
  "TAM":"LATAM Airlines",   "FDX":"FedEx Express",   "UPS":"UPS Airlines",
  "BCS":"DHL Aviation",     "DHK":"DHL Aviation",    "GTI":"Atlas Air",
};

// 200+ airport coordinates for delay overlay — covers all FAA-reported airports
// plus major global hubs shown permanently for context
const MAJOR_AIRPORTS = [
  // ── US Northeast ─────────────────────────────────────────────────────────
  {iata:"JFK",name:"JFK New York",          lat:40.6413,lon:-73.7781},
  {iata:"LGA",name:"LaGuardia",             lat:40.7772,lon:-73.8726},
  {iata:"EWR",name:"Newark Liberty",        lat:40.6895,lon:-74.1745},
  {iata:"BOS",name:"Boston Logan",          lat:42.3656,lon:-71.0096},
  {iata:"PHL",name:"Philadelphia Int'l",    lat:39.8729,lon:-75.2437},
  {iata:"BWI",name:"Baltimore/Washington",  lat:39.1754,lon:-76.6682},
  {iata:"IAD",name:"Washington Dulles",     lat:38.9531,lon:-77.4565},
  {iata:"DCA",name:"Washington Reagan",     lat:38.8512,lon:-77.0402},
  {iata:"BDL",name:"Bradley Int'l",         lat:41.9389,lon:-72.6832},
  {iata:"PVD",name:"Providence T.F. Green", lat:41.7236,lon:-71.4281},
  {iata:"ALB",name:"Albany Int'l",          lat:42.7483,lon:-73.8017},
  {iata:"BUF",name:"Buffalo Niagara",       lat:42.9405,lon:-78.7322},
  {iata:"SYR",name:"Syracuse Hancock",      lat:43.1112,lon:-76.1063},
  {iata:"ROC",name:"Rochester Frederick",   lat:43.1189,lon:-77.6724},
  // ── US Southeast ──────────────────────────────────────────────────────
  {iata:"ATL",name:"Atlanta Hartsfield",    lat:33.6407,lon:-84.4277},
  {iata:"CLT",name:"Charlotte Douglas",     lat:35.2140,lon:-80.9431},
  {iata:"MIA",name:"Miami Int'l",           lat:25.7959,lon:-80.2870},
  {iata:"FLL",name:"Fort Lauderdale",       lat:26.0726,lon:-80.1527},
  {iata:"MCO",name:"Orlando Int'l",         lat:28.4294,lon:-81.3089},
  {iata:"TPA",name:"Tampa Int'l",           lat:27.9755,lon:-82.5332},
  {iata:"PBI",name:"Palm Beach Int'l",      lat:26.6832,lon:-80.0956},
  {iata:"JAX",name:"Jacksonville Int'l",    lat:30.4941,lon:-81.6879},
  {iata:"SAV",name:"Savannah/Hilton Head",  lat:32.1276,lon:-81.2021},
  {iata:"RDU",name:"Raleigh-Durham",        lat:35.8776,lon:-78.7875},
  {iata:"GSO",name:"Greensboro-Piedmont",   lat:36.0978,lon:-79.9373},
  {iata:"BNA",name:"Nashville Int'l",       lat:36.1263,lon:-86.6774},
  {iata:"MEM",name:"Memphis Int'l",         lat:35.0421,lon:-90.0032},
  {iata:"MSY",name:"New Orleans Moisant",   lat:29.9934,lon:-90.2580},
  {iata:"BHM",name:"Birmingham-Shuttlesworth",lat:33.5629,lon:-86.7535},
  {iata:"SDF",name:"Louisville Int'l",      lat:38.1744,lon:-85.7360},
  {iata:"LEX",name:"Lexington Blue Grass",  lat:38.0365,lon:-84.6059},
  // ── US Midwest ────────────────────────────────────────────────────────
  {iata:"ORD",name:"Chicago O'Hare",        lat:41.9742,lon:-87.9073},
  {iata:"MDW",name:"Chicago Midway",        lat:41.7868,lon:-87.7522},
  {iata:"DTW",name:"Detroit Metro",         lat:42.2162,lon:-83.3554},
  {iata:"MSP",name:"Minneapolis-St Paul",   lat:44.8848,lon:-93.2223},
  {iata:"STL",name:"St Louis Lambert",      lat:38.7487,lon:-90.3700},
  {iata:"MCI",name:"Kansas City Int'l",     lat:39.2976,lon:-94.7139},
  {iata:"CMH",name:"Columbus Int'l",        lat:39.9980,lon:-82.8919},
  {iata:"IND",name:"Indianapolis Int'l",    lat:39.7173,lon:-86.2944},
  {iata:"CLE",name:"Cleveland Hopkins",     lat:41.4117,lon:-81.8498},
  {iata:"CVG",name:"Cincinnati/N. Kentucky",lat:39.0488,lon:-84.6678},
  {iata:"GRR",name:"Grand Rapids Ford",     lat:42.8808,lon:-85.5228},
  {iata:"MKE",name:"Milwaukee Mitchell",    lat:42.9472,lon:-87.8966},
  {iata:"OMA",name:"Omaha Eppley",          lat:41.3032,lon:-95.8940},
  // ── US South/Central ──────────────────────────────────────────────────
  {iata:"DFW",name:"Dallas/Fort Worth",     lat:32.8998,lon:-97.0403},
  {iata:"DAL",name:"Dallas Love Field",     lat:32.8471,lon:-96.8518},
  {iata:"IAH",name:"Houston Intercontinental",lat:29.9902,lon:-95.3368},
  {iata:"HOU",name:"Houston Hobby",         lat:29.6454,lon:-95.2789},
  {iata:"AUS",name:"Austin-Bergstrom",      lat:30.1975,lon:-97.6664},
  {iata:"SAT",name:"San Antonio Int'l",     lat:29.5337,lon:-98.4698},
  {iata:"OKC",name:"Oklahoma City Will Rogers",lat:35.3931,lon:-97.6007},
  {iata:"TUL",name:"Tulsa Int'l",           lat:36.1984,lon:-95.8881},
  {iata:"LIT",name:"Little Rock Clinton",   lat:34.7294,lon:-92.2243},
  // ── US West ───────────────────────────────────────────────────────────
  {iata:"LAX",name:"Los Angeles Int'l",     lat:33.9425,lon:-118.4081},
  {iata:"SFO",name:"San Francisco Int'l",   lat:37.6213,lon:-122.3790},
  {iata:"SEA",name:"Seattle-Tacoma",        lat:47.4502,lon:-122.3088},
  {iata:"DEN",name:"Denver Int'l",          lat:39.8561,lon:-104.6737},
  {iata:"PHX",name:"Phoenix Sky Harbor",    lat:33.4373,lon:-112.0078},
  {iata:"LAS",name:"Las Vegas Harry Reid",  lat:36.0840,lon:-115.1537},
  {iata:"SAN",name:"San Diego Int'l",       lat:32.7336,lon:-117.1897},
  {iata:"OAK",name:"Oakland Int'l",         lat:37.7213,lon:-122.2208},
  {iata:"SJC",name:"San Jose Int'l",        lat:37.3626,lon:-121.9290},
  {iata:"PDX",name:"Portland Int'l",        lat:45.5887,lon:-122.5975},
  {iata:"SLC",name:"Salt Lake City",        lat:40.7884,lon:-111.9778},
  {iata:"ABQ",name:"Albuquerque Int'l",     lat:35.0402,lon:-106.6090},
  {iata:"TUS",name:"Tucson Int'l",          lat:32.1161,lon:-110.9410},
  {iata:"ELP",name:"El Paso Int'l",         lat:31.8072,lon:-106.3779},
  {iata:"BOI",name:"Boise Airport",         lat:43.5644,lon:-116.2228},
  {iata:"BUR",name:"Hollywood Burbank",     lat:34.2007,lon:-118.3585},
  {iata:"ONT",name:"Ontario Int'l",         lat:34.0560,lon:-117.6012},
  {iata:"LGB",name:"Long Beach Airport",    lat:33.8177,lon:-118.1516},
  {iata:"SMF",name:"Sacramento Int'l",      lat:38.6954,lon:-121.5908},
  {iata:"RNO",name:"Reno-Tahoe Int'l",      lat:39.4991,lon:-119.7681},
  // ── US Mountain/Pacific extras ────────────────────────────────────────
  {iata:"GEG",name:"Spokane Int'l",         lat:47.6199,lon:-117.5339},
  {iata:"ANC",name:"Anchorage Int'l",       lat:61.1743,lon:-149.9963},
  {iata:"HNL",name:"Honolulu Int'l",        lat:21.3245,lon:-157.9251},
  {iata:"OGG",name:"Maui Kahului",          lat:20.8986,lon:-156.4305},
  {iata:"FAI",name:"Fairbanks Int'l",       lat:64.8151,lon:-147.8561},
  // ── Canada ────────────────────────────────────────────────────────────
  {iata:"YYZ",name:"Toronto Pearson",       lat:43.6777,lon:-79.6248},
  {iata:"YVR",name:"Vancouver Int'l",       lat:49.1947,lon:-123.1839},
  {iata:"YUL",name:"Montreal Trudeau",      lat:45.4706,lon:-73.7408},
  {iata:"YYC",name:"Calgary Int'l",         lat:51.1315,lon:-114.0106},
  {iata:"YEG",name:"Edmonton Int'l",        lat:53.3097,lon:-113.5796},
  {iata:"YOW",name:"Ottawa Macdonald-Cartier",lat:45.3225,lon:-75.6692},
  {iata:"YHZ",name:"Halifax Stanfield",     lat:44.8808,lon:-63.5086},
  {iata:"YWG",name:"Winnipeg Richardson",   lat:49.9100,lon:-97.2398},
  // ── Europe — UK & Ireland ─────────────────────────────────────────────
  {iata:"LHR",name:"London Heathrow",       lat:51.4775,lon:-0.4614},
  {iata:"LGW",name:"London Gatwick",        lat:51.1537,lon:-0.1821},
  {iata:"STN",name:"London Stansted",       lat:51.8850,lon:0.2350},
  {iata:"LTN",name:"London Luton",          lat:51.8747,lon:-0.3683},
  {iata:"MAN",name:"Manchester Airport",    lat:53.3537,lon:-2.2750},
  {iata:"EDI",name:"Edinburgh Airport",     lat:55.9500,lon:-3.3725},
  {iata:"BHX",name:"Birmingham Airport",    lat:52.4539,lon:-1.7480},
  {iata:"DUB",name:"Dublin Airport",        lat:53.4213,lon:-6.2701},
  {iata:"BFS",name:"Belfast Int'l",         lat:54.6575,lon:-6.2158},
  // ── Europe — Western ──────────────────────────────────────────────────
  {iata:"CDG",name:"Paris Charles de Gaulle",lat:49.0097,lon:2.5479},
  {iata:"ORY",name:"Paris Orly",            lat:48.7233,lon:2.3794},
  {iata:"FRA",name:"Frankfurt Main",        lat:50.0379,lon:8.5622},
  {iata:"MUC",name:"Munich Int'l",          lat:48.3537,lon:11.7860},
  {iata:"AMS",name:"Amsterdam Schiphol",    lat:52.3086,lon:4.7639},
  {iata:"BRU",name:"Brussels Zaventem",     lat:50.9014,lon:4.4844},
  {iata:"ZRH",name:"Zurich Airport",        lat:47.4647,lon:8.5492},
  {iata:"GVA",name:"Geneva Airport",        lat:46.2380,lon:6.1090},
  {iata:"VIE",name:"Vienna Int'l",          lat:48.1102,lon:16.5697},
  {iata:"MAD",name:"Madrid Barajas",        lat:40.4936,lon:-3.5668},
  {iata:"BCN",name:"Barcelona El Prat",     lat:41.2974,lon:2.0833},
  {iata:"LIS",name:"Lisbon Humberto Delgado",lat:38.7742,lon:-9.1342},
  {iata:"FCO",name:"Rome Fiumicino",        lat:41.8003,lon:12.2389},
  {iata:"MXP",name:"Milan Malpensa",        lat:45.6306,lon:8.7281},
  {iata:"LIN",name:"Milan Linate",          lat:45.4455,lon:9.2767},
  {iata:"ATH",name:"Athens Eleftherios Venizelos",lat:37.9364,lon:23.9445},
  {iata:"PRG",name:"Prague Václav Havel",   lat:50.1008,lon:14.2600},
  {iata:"BUD",name:"Budapest Ferihegy",     lat:47.4298,lon:19.2611},
  {iata:"WAW",name:"Warsaw Chopin",         lat:52.1657,lon:20.9671},
  {iata:"ARN",name:"Stockholm Arlanda",     lat:59.6519,lon:17.9186},
  {iata:"OSL",name:"Oslo Gardermoen",       lat:60.1939,lon:11.1004},
  {iata:"CPH",name:"Copenhagen Kastrup",    lat:55.6180,lon:12.6560},
  {iata:"HEL",name:"Helsinki Vantaa",       lat:60.3172,lon:24.9633},
  // ── Europe — Eastern & Russia ─────────────────────────────────────────
  {iata:"SVO",name:"Moscow Sheremetyevo",   lat:55.9726,lon:37.4146},
  {iata:"DME",name:"Moscow Domodedovo",     lat:55.4088,lon:37.9063},
  {iata:"LED",name:"St Petersburg Pulkovo", lat:59.8003,lon:30.2625},
  {iata:"KBP",name:"Kyiv Boryspil",         lat:50.3450,lon:30.8947},
  {iata:"OTP",name:"Bucharest Henri Coanda",lat:44.5711,lon:26.0850},
  {iata:"SOF",name:"Sofia Airport",         lat:42.6967,lon:23.4114},
  {iata:"IST",name:"Istanbul Airport",      lat:41.2608,lon:28.7418},
  {iata:"SAW",name:"Istanbul Sabiha",       lat:40.8983,lon:29.3092},
  // ── Middle East ───────────────────────────────────────────────────────
  {iata:"DXB",name:"Dubai Int'l",           lat:25.2528,lon:55.3644},
  {iata:"AUH",name:"Abu Dhabi Int'l",       lat:24.4330,lon:54.6511},
  {iata:"DOH",name:"Doha Hamad Int'l",      lat:25.2731,lon:51.6080},
  {iata:"RUH",name:"Riyadh King Khalid",    lat:24.9576,lon:46.6988},
  {iata:"JED",name:"Jeddah King Abdulaziz", lat:21.6796,lon:39.1565},
  {iata:"TLV",name:"Tel Aviv Ben Gurion",   lat:32.0114,lon:34.8867},
  {iata:"AMM",name:"Amman Queen Alia",      lat:31.7226,lon:35.9932},
  {iata:"CAI",name:"Cairo Int'l",           lat:30.1219,lon:31.4056},
  {iata:"BAH",name:"Bahrain Int'l",         lat:26.2708,lon:50.6336},
  {iata:"KWI",name:"Kuwait Int'l",          lat:29.2267,lon:47.9689},
  {iata:"MCT",name:"Muscat Int'l",          lat:23.5933,lon:58.2844},
  // ── Asia-Pacific — East Asia ──────────────────────────────────────────
  {iata:"PEK",name:"Beijing Capital",       lat:40.0799,lon:116.6031},
  {iata:"PKX",name:"Beijing Daxing",        lat:39.5095,lon:116.4105},
  {iata:"PVG",name:"Shanghai Pudong",       lat:31.1434,lon:121.8052},
  {iata:"SHA",name:"Shanghai Hongqiao",     lat:31.1979,lon:121.3360},
  {iata:"CAN",name:"Guangzhou Baiyun",      lat:23.3924,lon:113.2988},
  {iata:"SZX",name:"Shenzhen Bao'an",       lat:22.6393,lon:113.8107},
  {iata:"CTU",name:"Chengdu Tianfu",        lat:30.3124,lon:104.4440},
  {iata:"HKG",name:"Hong Kong Int'l",       lat:22.3080,lon:113.9185},
  {iata:"TPE",name:"Taipei Taoyuan",        lat:25.0777,lon:121.2328},
  {iata:"ICN",name:"Seoul Incheon",         lat:37.4602,lon:126.4407},
  {iata:"GMP",name:"Seoul Gimpo",           lat:37.5583,lon:126.7906},
  {iata:"NRT",name:"Tokyo Narita",          lat:35.7647,lon:140.3864},
  {iata:"HND",name:"Tokyo Haneda",          lat:35.5494,lon:139.7798},
  {iata:"KIX",name:"Osaka Kansai",          lat:34.4272,lon:135.2440},
  {iata:"NGO",name:"Nagoya Chubu",          lat:34.8583,lon:136.8050},
  {iata:"FUK",name:"Fukuoka Airport",       lat:33.5858,lon:130.4508},
  {iata:"CTS",name:"Sapporo New Chitose",   lat:42.7752,lon:141.6920},
  // ── Asia-Pacific — Southeast & South Asia ─────────────────────────────
  {iata:"SIN",name:"Singapore Changi",      lat:1.3644,lon:103.9915},
  {iata:"KUL",name:"Kuala Lumpur Int'l",    lat:2.7456,lon:101.7099},
  {iata:"BKK",name:"Bangkok Suvarnabhumi",  lat:13.6811,lon:100.7475},
  {iata:"DMK",name:"Bangkok Don Mueang",    lat:13.9126,lon:100.6067},
  {iata:"CGK",name:"Jakarta Soekarno-Hatta",lat:-6.1275,lon:106.6537},
  {iata:"MNL",name:"Manila Ninoy Aquino",   lat:14.5086,lon:121.0194},
  {iata:"SGN",name:"Ho Chi Minh City",      lat:10.8188,lon:106.6520},
  {iata:"HAN",name:"Hanoi Noi Bai",         lat:21.2212,lon:105.8072},
  {iata:"RGN",name:"Yangon Int'l",          lat:16.9073,lon:96.1332},
  {iata:"BOM",name:"Mumbai Chhatrapati",    lat:19.0896,lon:72.8656},
  {iata:"DEL",name:"New Delhi Indira Gandhi",lat:28.5562,lon:77.1000},
  {iata:"BLR",name:"Bangalore Kempegowda",  lat:13.1979,lon:77.7063},
  {iata:"MAA",name:"Chennai Int'l",         lat:12.9900,lon:80.1693},
  {iata:"CCU",name:"Kolkata Netaji Subhash",lat:22.6547,lon:88.4467},
  {iata:"HYD",name:"Hyderabad Rajiv Gandhi",lat:17.2313,lon:78.4298},
  {iata:"CMB",name:"Colombo Bandaranaike",  lat:7.1808,lon:79.8841},
  {iata:"DAC",name:"Dhaka Hazrat Shahjalal",lat:23.8433,lon:90.3979},
  {iata:"KTM",name:"Kathmandu Tribhuvan",   lat:27.6966,lon:85.3591},
  // ── Asia-Pacific — Oceania ────────────────────────────────────────────
  {iata:"SYD",name:"Sydney Kingsford Smith",lat:-33.9399,lon:151.1753},
  {iata:"MEL",name:"Melbourne Tullamarine", lat:-37.6690,lon:144.8410},
  {iata:"BNE",name:"Brisbane Airport",      lat:-27.3842,lon:153.1175},
  {iata:"PER",name:"Perth Airport",         lat:-31.9403,lon:115.9669},
  {iata:"ADL",name:"Adelaide Airport",      lat:-34.9450,lon:138.5306},
  {iata:"AKL",name:"Auckland Airport",      lat:-37.0082,lon:174.7917},
  {iata:"CHC",name:"Christchurch Int'l",    lat:-43.4894,lon:172.5322},
  {iata:"NAN",name:"Nadi Int'l Fiji",       lat:-17.7554,lon:177.4431},
  // ── Latin America ─────────────────────────────────────────────────────
  {iata:"MEX",name:"Mexico City Benito Juarez",lat:19.4363,lon:-99.0721},
  {iata:"GDL",name:"Guadalajara Miguel Hidalgo",lat:20.5218,lon:-103.3112},
  {iata:"MTY",name:"Monterrey Gen Mariano",  lat:25.7785,lon:-100.1069},
  {iata:"CUN",name:"Cancún Int'l",           lat:21.0365,lon:-86.8771},
  {iata:"GRU",name:"São Paulo Guarulhos",    lat:-23.4356,lon:-46.4731},
  {iata:"CGH",name:"São Paulo Congonhas",    lat:-23.6261,lon:-46.6564},
  {iata:"GIG",name:"Rio de Janeiro Galeão",  lat:-22.8099,lon:-43.2505},
  {iata:"SDU",name:"Rio de Janeiro Santos Dumont",lat:-22.9105,lon:-43.1631},
  {iata:"BSB",name:"Brasília Int'l",         lat:-15.8711,lon:-47.9186},
  {iata:"BOG",name:"Bogotá El Dorado",       lat:4.7016,lon:-74.1469},
  {iata:"LIM",name:"Lima Jorge Chávez",      lat:-12.0219,lon:-77.1143},
  {iata:"SCL",name:"Santiago Arturo Merino", lat:-33.3930,lon:-70.7858},
  {iata:"EZE",name:"Buenos Aires Ezeiza",    lat:-34.8222,lon:-58.5358},
  {iata:"AEP",name:"Buenos Aires Aeroparque",lat:-34.5592,lon:-58.4156},
  {iata:"UIO",name:"Quito Mariscal Sucre",   lat:-0.1292,lon:-78.3575},
  {iata:"PTY",name:"Panama City Tocumen",    lat:9.0714,lon:-79.3835},
  {iata:"SJO",name:"San José Juan Santamaría",lat:9.9939,lon:-84.2089},
  {iata:"MDE",name:"Medellín El Dorado",     lat:6.1646,lon:-75.4231},
  // ── Africa ────────────────────────────────────────────────────────────
  {iata:"JNB",name:"Johannesburg OR Tambo",  lat:-26.1392,lon:28.2460},
  {iata:"CPT",name:"Cape Town Int'l",        lat:-33.9649,lon:18.6017},
  {iata:"NBO",name:"Nairobi Jomo Kenyatta",  lat:-1.3192,lon:36.9275},
  {iata:"ADD",name:"Addis Ababa Bole",       lat:8.9779,lon:38.7993},
  {iata:"LOS",name:"Lagos Murtala Muhammed", lat:6.5774,lon:3.3212},
  {iata:"ABV",name:"Abuja Nnamdi Azikiwe",   lat:9.0068,lon:7.2632},
  {iata:"ACC",name:"Accra Kotoka",           lat:5.6052,lon:-0.1668},
  {iata:"CMN",name:"Casablanca Mohammed V",  lat:33.3675,lon:-7.5900},
  {iata:"TUN",name:"Tunis-Carthage",         lat:36.8510,lon:10.2272},
  {iata:"ALG",name:"Algiers Houari Boumediene",lat:36.6910,lon:3.2154},
  {iata:"DKR",name:"Dakar Léopold Sédar Senghor",lat:14.7397,lon:-17.4902},
  {iata:"EBB",name:"Entebbe Int'l",          lat:0.0424,lon:32.4435},
  {iata:"DAR",name:"Dar es Salaam Julius Nyerere",lat:-6.8781,lon:39.2026},
  {iata:"HRE",name:"Harare Robert Mugabe",   lat:-17.9318,lon:31.0928},
  {iata:"LUN",name:"Lusaka Kenneth Kaunda",  lat:-15.3308,lon:28.4526},
];

/* ══════════════════════════════════════════════════════════════════════════════
   COLOURS & BASE STYLES
══════════════════════════════════════════════════════════════════════════════ */

const C = {
  bg0:"#020b14",bg1:"#060f1c",bg2:"#0a1829",
  panel:"#060f1c",card:"#0c1e33",
  border:"#0f2d4a",borderB:"#164060",
  accent:"#00b4ff",accentD:"#0077cc",
  text:"#c8dff0",muted:"#3a6080",dim:"#0d2035",
  warn:"#ffb300",danger:"#ff3b3b",safe:"#22dd77",
  mil:"#4499ff",vip:"#cc88ff",
  wx:"#ff8c00",wxTurb:"#ff6600",wxDelay:"#ffcc00",
};

const sel={width:"100%",background:C.card,border:`1px solid ${C.border}`,color:C.text,borderRadius:"4px",padding:"6px 8px",fontSize:"11px",fontFamily:"'Share Tech Mono',monospace",outline:"none",cursor:"pointer"};
const inp={width:"100%",background:C.card,border:`1px solid ${C.border}`,color:C.text,borderRadius:"4px",padding:"6px 8px",fontSize:"11px",fontFamily:"'Share Tech Mono',monospace",outline:"none"};
const btn={background:C.dim,border:`1px solid ${C.border}`,color:C.muted,borderRadius:"4px",padding:"5px 10px",cursor:"pointer",fontSize:"11px",fontFamily:"'Share Tech Mono',monospace"};

/* ══════════════════════════════════════════════════════════════════════════════
   CANVAS IMAGE GENERATOR (for downloadable post cards)
══════════════════════════════════════════════════════════════════════════════ */

function generatePostImage(ev) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080; canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  const sev = SEVERITY_META[ev.severity] || SEVERITY_META.medium;
  const meta = EVENT_META[ev.type] || EVENT_META.incident;
  const accentColor = sev.color;

  // Background
  ctx.fillStyle = "#020b14"; ctx.fillRect(0,0,1080,1080);

  // Subtle grid
  ctx.strokeStyle = "#0f2d4a33"; ctx.lineWidth = 1;
  for (let i=0;i<1080;i+=60){
    ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,1080); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(1080,i); ctx.stroke();
  }

  // Top accent bar
  const grad = ctx.createLinearGradient(0,0,1080,0);
  grad.addColorStop(0, accentColor);
  grad.addColorStop(1, accentColor+"22");
  ctx.fillStyle = grad; ctx.fillRect(0,0,1080,8);

  // Header band
  ctx.fillStyle = accentColor+"18"; ctx.fillRect(0,8,1080,110);

  // Event type badge
  ctx.fillStyle = accentColor+"44";
  ctx.roundRect(40,30,220,48,6); ctx.fill();
  ctx.fillStyle = accentColor;
  ctx.font = "bold 24px monospace";
  ctx.fillText(`${meta.icon}  ${ev.type.toUpperCase()}`, 60, 62);

  // Severity badge
  ctx.fillStyle = sev.dim;
  ctx.roundRect(280,30,160,48,6); ctx.fill();
  ctx.strokeStyle = accentColor+"66"; ctx.lineWidth=1;
  ctx.roundRect(280,30,160,48,6); ctx.stroke();
  ctx.fillStyle = accentColor;
  ctx.font = "bold 20px monospace";
  ctx.fillText(sev.label, 300, 62);

  // AVOSINT brand
  ctx.fillStyle = "#00b4ff";
  ctx.font = "bold 28px monospace";
  ctx.fillText("AVOSINT", 750, 58);
  ctx.fillStyle = "#3a6080"; ctx.font = "16px monospace";
  ctx.fillText("AVIATION INTELLIGENCE", 710, 82);

  // Divider
  ctx.strokeStyle = accentColor+"55"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40,130); ctx.lineTo(1040,130); ctx.stroke();

  // Aircraft name (big)
  ctx.fillStyle = "#e8f4ff";
  ctx.font = "bold 52px monospace";
  const acName = ev.aircraft.length > 22 ? ev.aircraft.slice(0,22)+"…" : ev.aircraft;
  ctx.fillText(acName, 40, 210);

  // Carrier
  if (ev.carrier) {
    ctx.fillStyle = "#00b4ff"; ctx.font = "28px monospace";
    ctx.fillText(ev.carrier, 40, 255);
  }

  // Key data grid (2 columns × 4 rows)
  const fields = [
    ["REG / TAIL",    ev.reg || "N/A"],
    ["LOCATION",      ev.location.length>24 ? ev.location.slice(0,24)+"…" : ev.location],
    ["DATE",          ev.date],
    ["PHASE",         ev.phase],
    ["CATEGORY",      ev.category],
    ["SOURCE",        ev.source],
    ["INJURIES",      ev.injuries || "None"],
    ["FATALITIES",    ev.fatalities > 0 ? `${ev.fatalities} FATAL` : "None"],
  ];

  fields.forEach(([label,value],i) => {
    const col = i%2; const row = Math.floor(i/2);
    const x = col===0 ? 40 : 560;
    const y = 300 + row*140;
    // card bg
    ctx.fillStyle = "#0c1e33";
    ctx.roundRect(x,y,480,115,6); ctx.fill();
    ctx.strokeStyle = label==="FATALITIES"&&ev.fatalities>0 ? "#ff333388" : "#0f2d4a";
    ctx.lineWidth = 1;
    ctx.roundRect(x,y,480,115,6); ctx.stroke();
    // label
    ctx.fillStyle = "#3a6080"; ctx.font = "18px monospace";
    ctx.fillText(label, x+16, y+30);
    // value
    ctx.fillStyle = label==="FATALITIES"&&ev.fatalities>0 ? "#ff4444" : "#c8dff0";
    ctx.font = `bold 30px monospace`;
    ctx.fillText(String(value).slice(0,22), x+16, y+82);
  });

  // Description excerpt
  ctx.fillStyle = "#0c1e33"; ctx.roundRect(40,875,1000,120,6); ctx.fill();
  ctx.strokeStyle="#0f2d4a"; ctx.lineWidth=1; ctx.roundRect(40,875,1000,120,6); ctx.stroke();
  ctx.fillStyle = "#8ab4cc"; ctx.font = "20px 'Arial'";
  const desc = ev.description.slice(0,120) + (ev.description.length>120?"…":"");
  // Word wrap basic
  const words = desc.split(" ");
  let line = ""; let ly = 910;
  words.forEach(w => {
    const test = line + w + " ";
    if (ctx.measureText(test).width > 960 && line) {
      ctx.fillText(line.trim(), 56, ly); line = w+" "; ly += 26;
    } else { line = test; }
  });
  if (line) ctx.fillText(line.trim(), 56, ly);

  // Footer
  ctx.fillStyle = "#06101a"; ctx.fillRect(0,1010,1080,70);
  ctx.strokeStyle = accentColor+"33";
  ctx.beginPath(); ctx.moveTo(0,1010); ctx.lineTo(1080,1010); ctx.stroke();
  ctx.fillStyle = "#3a6080"; ctx.font = "18px monospace";
  ctx.fillText(new Date().toUTCString().slice(0,25), 40, 1050);
  ctx.fillStyle = accentColor; ctx.font = "bold 18px monospace";
  ctx.fillText("#Aviation #AviationSafety #OSINT #Avgeek", 480, 1050);

  return canvas.toDataURL("image/png");
}

/* ══════════════════════════════════════════════════════════════════════════════
   PROMPTS
══════════════════════════════════════════════════════════════════════════════ */

function buildCaptionPrompt(ev) {
  return `Write a compelling social media caption for this aviation ${ev.type} report. 
Make it informative, professional, and engaging. Include key facts: aircraft, location, what happened, phase of flight.
Keep it under 220 characters for the main text. Then add a separate line of relevant hashtags.
Format your response as:
CAPTION: [main text here]
HASHTAGS: [hashtags here]

Event data: Aircraft: ${ev.aircraft}, Location: ${ev.location}, Date: ${ev.date}, Type: ${ev.type}, Severity: ${ev.severity}, Phase: ${ev.phase}, ${ev.carrier?"Carrier: "+ev.carrier+",":""} ${ev.fatalities>0?"Fatalities: "+ev.fatalities+",":""} Source: ${ev.source}.
Brief: ${ev.description.slice(0,200)}`;
}

function buildChatSystemPrompt(context, state) {
  if (context === "general") {
    return `You are an expert aviation analyst, safety investigator, and OSINT specialist embedded in the AVOSINT aviation intelligence platform. You have deep knowledge of:
- Aviation safety regulations (FAA, EASA, ICAO)
- Aircraft types, systems, and performance
- ATC procedures and airspace structure  
- NTSB/AAIB/AAIO investigation methodology
- Aviation meteorology and weather hazards
- Military aviation and special operations
- OSINT techniques for aviation monitoring (ADS-B, squawk codes, flight tracking)

Answer questions accurately, specifically, and educationally. Use proper aviation terminology. If asked about incidents, cite real-world examples when relevant.`;
  }
  return `You are an expert aviation analyst embedded in the AVOSINT aviation intelligence platform. You have deep knowledge of aviation safety, regulations, OSINT, and incident investigation.

CURRENT DASHBOARD STATE:
• Region: ${REGIONS[state.region]?.label || state.region}
• Aircraft filter: ${state.aircraftCat}
• Carrier filter: ${state.carrier}
• Date range: ${state.dateFrom||"All dates"} → ${state.dateTo||"Present"}
• Events visible: ${state.filteredCount} total (source: ASRS + SDR)
• Live aircraft tracked: ${state.flightCount.toLocaleString()} (${state.airborne.toLocaleString()} airborne)
• Active emergency squawks: ${state.emergency > 0 ? state.emergency + " active" : "None"}
${state.emergency > 0 ? "• Emergency callsigns: " + state.emgCallsigns : ""}
${state.weatherActive ? "• Weather layers active: " + state.weatherLayers : ""}

TOP VISIBLE EVENTS:
${state.topEvents}

Answer questions about both the data shown above AND general aviation topics. When referencing dashboard data, be specific about what you can see. Be authoritative and use proper aviation terminology.`;
}

const ANALYSIS_PROMPTS = {
  safety:`You are a senior aviation safety analyst with deep expertise in NTSB/FAA/EASA investigative methodology.
Analyze the following aviation events and produce a structured safety intelligence brief.
Include: 1) EXECUTIVE SUMMARY 2) DOMINANT CAUSAL FACTORS (cite specific events) 3) HIGH-RISK SEGMENTS 4) CARRIER & OPERATOR TRENDS 5) GEOGRAPHIC PATTERNS 6) RECOMMENDATIONS (3-5 prioritized)
Be specific. Do NOT invent data.`,
  patterns:`You are an aviation OSINT analyst specializing in pattern-of-life analysis.
Analyze these events for behavioral and operational patterns.
Include: 1) OPERATIONAL OVERVIEW 2) TEMPORAL PATTERNS 3) AIRCRAFT & FLEET PATTERNS 4) ANOMALIES & OUTLIERS 5) ESCALATION INDICATORS 6) INTELLIGENCE GAPS
Write as an intelligence assessment brief.`,
  threat:`You are an aviation security and threat assessment specialist.
Review these events through a security lens.
Include: 1) THREAT LANDSCAPE SUMMARY 2) SECURITY-RELEVANT EVENTS 3) VULNERABILITY INDICATORS 4) ACTOR PROFILES 5) RISK MATRIX (CRITICAL/HIGH/MEDIUM/LOW) 6) WATCHLIST ITEMS
Note when conclusions are inferential vs data-supported.`,
};

/* ══════════════════════════════════════════════════════════════════════════════
   SMALL COMPONENTS
══════════════════════════════════════════════════════════════════════════════ */

function FilterSection({title,children}) {
  return (
    <div style={{marginBottom:"18px"}}>
      <div style={{fontSize:"9px",fontFamily:"'Orbitron',monospace",letterSpacing:"0.15em",color:C.muted,borderBottom:`1px solid ${C.border}`,paddingBottom:"5px",marginBottom:"9px",display:"flex",alignItems:"center",gap:"6px"}}>
        <span style={{color:C.accentD}}>▸</span>{title}
      </div>
      {children}
    </div>
  );
}

function StatPill({label,value,color,blink}) {
  return (
    <div style={{textAlign:"center",minWidth:"72px",borderLeft:`1px solid ${C.border}`,paddingLeft:"14px"}}>
      <div style={{fontSize:"20px",fontWeight:"bold",fontFamily:"'Share Tech Mono',monospace",color,animation:blink&&value>0?"blink 1.4s step-end infinite":"none",lineHeight:1}}>
        {typeof value==="number"?value.toLocaleString():value}
      </div>
      <div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.12em",marginTop:"2px",fontFamily:"'Orbitron',monospace"}}>{label}</div>
    </div>
  );
}

function Toggle({on,onToggle,label,color=C.accent}) {
  return (
    <label style={{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer",userSelect:"none"}}>
      <div onClick={onToggle} style={{width:"32px",height:"16px",borderRadius:"8px",background:on?color:C.border,cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0}}>
        <div style={{position:"absolute",top:"2px",left:on?"18px":"2px",width:"12px",height:"12px",borderRadius:"50%",background:"white",transition:"left 0.2s"}}/>
      </div>
      <span style={{fontSize:"11px",color:on?color:C.muted}}>{label}</span>
    </label>
  );
}

function EventCard({ev,selected,onClick,onGeneratePost,generating}) {
  const sev=SEVERITY_META[ev.severity]||SEVERITY_META.medium;
  const meta=EVENT_META[ev.type]||EVENT_META.incident;
  const [hov,setHov]=useState(false);
  return (
    <div onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{padding:"11px 12px",borderBottom:`1px solid ${C.border}`,cursor:"pointer",background:selected?C.dim:hov?C.bg2:"transparent",borderLeft:`3px solid ${selected?sev.color:hov?C.border:"transparent"}`,transition:"all 0.12s ease"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"3px"}}>
        <span style={{fontSize:"10px",color:meta.color,fontFamily:"'Share Tech Mono',monospace"}}>{meta.icon} {ev.type.toUpperCase()}</span>
        <div style={{display:"flex",alignItems:"center",gap:"5px"}}>
          <span style={{fontSize:"8px",background:sev.dim,color:sev.color,border:`1px solid ${sev.color}44`,borderRadius:"3px",padding:"1px 5px",fontFamily:"'Orbitron',monospace"}}>{sev.label}</span>
          <button onClick={e=>{e.stopPropagation();onGeneratePost(ev);}} disabled={generating}
            title="Generate social post"
            style={{...btn,padding:"2px 6px",fontSize:"9px",color:generating?C.muted:"#cc88ff",border:`1px solid ${generating?C.border:"#cc88ff44"}`,background:C.bg0}}>
            {generating?"…":"📷"}
          </button>
        </div>
      </div>
      <div style={{fontWeight:"600",fontSize:"12px",color:C.text,marginBottom:"2px"}}>{ev.aircraft}</div>
      {ev.carrier&&<div style={{fontSize:"10px",color:C.accent,marginBottom:"1px"}}>{ev.carrier}</div>}
      <div style={{fontSize:"10px",color:C.muted}}>{ev.location}</div>
      <div style={{fontSize:"9px",color:C.muted,marginTop:"3px",fontFamily:"'Share Tech Mono',monospace"}}>
        {ev.date} · {ev.source}{ev.source==="ASIAS"&&<span style={{marginLeft:"4px",fontSize:"8px",background:"#ff664422",color:"#ff9966",border:"1px solid #ff664444",borderRadius:"2px",padding:"0 4px",fontFamily:"'Orbitron',monospace"}}>PRELIMINARY</span>} · {ev.phase}
        {ev.fatalities>0&&<span style={{color:C.danger,fontWeight:"bold"}}> · {ev.fatalities}✝</span>}
      </div>
    </div>
  );
}

function DetailPanel({ev,onClose,onGeneratePost,generating}) {
  if(!ev) return (
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:C.muted,gap:"10px"}}>
      <div style={{fontSize:"32px",opacity:0.3}}>✈</div>
      <div style={{fontFamily:"'Orbitron',monospace",fontSize:"10px",letterSpacing:"0.1em"}}>SELECT AN EVENT</div>
    </div>
  );
  const sev=SEVERITY_META[ev.severity]||SEVERITY_META.medium;
  const meta=EVENT_META[ev.type]||EVENT_META.incident;
  return (
    <div style={{flex:1,overflow:"auto",padding:"16px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"14px"}}>
        <div>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:"10px",color:meta.color,marginBottom:"4px"}}>{meta.icon} {ev.type.toUpperCase()} · {sev.label}</div>
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:"14px",color:C.text,lineHeight:1.3}}>{ev.aircraft}</div>
        </div>
        <div style={{display:"flex",gap:"6px"}}>
          <button onClick={()=>onGeneratePost(ev)} disabled={generating}
            style={{...btn,padding:"4px 10px",fontSize:"10px",color:generating?C.muted:"#cc88ff",border:`1px solid #cc88ff44`}}>
            {generating?"Generating…":"📷 GENERATE POST"}
          </button>
          <button onClick={onClose} style={{...btn,padding:"3px 10px",fontSize:"14px",color:C.muted}}>×</button>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px",marginBottom:"14px"}}>
        {[["REG",ev.reg||"N/A"],["CATEGORY",ev.category||"—"],["CARRIER",ev.carrier||"Independent"],["PHASE",ev.phase||"—"],["DATE",ev.date],["SOURCE",ev.source],["INJURIES",ev.injuries||"Not reported"],["FATALITIES",ev.fatalities>0?`${ev.fatalities} FATAL`:"NONE"]].map(([k,v])=>(
          <div key={k} style={{background:C.bg0,border:`1px solid ${C.border}`,borderRadius:"4px",padding:"7px 9px"}}>
            <div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.12em",fontFamily:"'Orbitron',monospace",marginBottom:"3px"}}>{k}</div>
            <div style={{fontSize:"11px",color:(k==="FATALITIES"&&ev.fatalities>0)?C.danger:C.text,fontFamily:"'Share Tech Mono',monospace",fontWeight:k==="FATALITIES"&&ev.fatalities>0?"bold":"normal"}}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{marginBottom:"12px"}}>
        <div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.12em",fontFamily:"'Orbitron',monospace",marginBottom:"5px"}}>LOCATION</div>
        <div style={{background:C.bg0,border:`1px solid ${C.border}`,borderRadius:"4px",padding:"9px"}}>
          <div style={{color:C.accent,fontSize:"12px",marginBottom:"3px"}}>📍 {ev.location}</div>
          {ev.lat!=null&&<div style={{fontSize:"10px",color:C.muted,fontFamily:"'Share Tech Mono',monospace"}}>{ev.lat.toFixed(4)}°{ev.lat>=0?"N":"S"} · {Math.abs(ev.lon).toFixed(4)}°{ev.lon<0?"W":"E"}</div>}
        </div>
      </div>
      <div>
        <div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.12em",fontFamily:"'Orbitron',monospace",marginBottom:"5px"}}>
          {ev.source==="ASIAS"?"PRELIMINARY NARRATIVE — SUBJECT TO CHANGE":"INCIDENT NARRATIVE"}
        </div>
        {ev.source==="ASIAS"&&(
          <div style={{marginBottom:"8px",padding:"6px 9px",background:"#1a0800",border:"1px solid #ff664444",borderRadius:"4px",fontSize:"10px",color:"#ff9966",fontFamily:"'Share Tech Mono',monospace",lineHeight:1.5}}>
            ⚠ FAA ASIAS preliminary data. All information is subject to change pending investigation. Window: last 10 business days only.
          </div>
        )}
        <div style={{background:C.bg0,border:`1px solid ${C.border}`,borderRadius:"4px",padding:"12px",fontSize:"12px",lineHeight:"1.65",color:C.text}}>{ev.description}</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   POST MODAL
══════════════════════════════════════════════════════════════════════════════ */

function PostModal({state,onClose}) {
  const [caption,setCaption]=useState("");
  const [hashtags,setHashtags]=useState("");
  const [copied,setCopied]=useState(false);

  useEffect(()=>{
    if(state.caption) {
      const capMatch = state.caption.match(/CAPTION:\s*([\s\S]*?)(?=HASHTAGS:|$)/i);
      const tagMatch = state.caption.match(/HASHTAGS:\s*([\s\S]*?)$/i);
      setCaption(capMatch?capMatch[1].trim():state.caption);
      setHashtags(tagMatch?tagMatch[1].trim():"#Aviation #AviationSafety #OSINT #Avgeek");
    }
  },[state.caption]);

  const downloadImage=()=>{
    const a=document.createElement("a");
    a.href=state.imageUrl;
    a.download=`avosint_${state.event?.type}_${state.event?.date||"post"}.png`;
    a.click();
  };

  const copyAll=()=>{
    navigator.clipboard.writeText(`${caption}\n\n${hashtags}`);
    setCopied(true);
    setTimeout(()=>setCopied(false),2000);
  };

  if(!state.open) return null;

  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:C.bg1,border:`1px solid #cc88ff44`,borderRadius:"10px",width:"min(700px,95vw)",maxHeight:"90vh",overflow:"auto",display:"flex",flexDirection:"column"}}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:"11px",color:"#cc88ff",letterSpacing:"0.12em"}}>📷 POST GENERATOR</div>
          <button onClick={onClose} style={{...btn,fontSize:"16px",padding:"2px 10px",color:C.muted}}>×</button>
        </div>

        {state.generating ? (
          <div style={{padding:"60px",textAlign:"center"}}>
            <div style={{fontSize:"32px",color:"#cc88ff",animation:"blink 0.8s step-end infinite",marginBottom:"16px"}}>◈</div>
            <div style={{fontFamily:"'Orbitron',monospace",fontSize:"11px",color:C.muted,letterSpacing:"0.12em"}}>GENERATING POST…</div>
            <div style={{fontSize:"10px",color:C.muted,marginTop:"8px",fontFamily:"'Share Tech Mono',monospace"}}>Rendering image card + writing caption</div>
          </div>
        ) : (
          <div style={{display:"flex",gap:"0",flexWrap:"wrap"}}>
            {/* Image preview */}
            <div style={{padding:"18px",flex:"0 0 auto",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px",borderRight:`1px solid ${C.border}`,minWidth:"280px"}}>
              <div style={{fontSize:"8px",fontFamily:"'Orbitron',monospace",color:C.muted,letterSpacing:"0.12em",alignSelf:"flex-start"}}>IMAGE PREVIEW (1080×1080)</div>
              <img src={state.imageUrl} alt="Post card" style={{width:"100%",maxWidth:"280px",borderRadius:"6px",border:`1px solid ${C.border}`}}/>
              <button onClick={downloadImage} style={{...btn,width:"100%",color:"#cc88ff",border:`1px solid #cc88ff44`,padding:"8px",fontFamily:"'Orbitron',monospace",fontSize:"10px",letterSpacing:"0.1em"}}>
                ⬇ DOWNLOAD PNG
              </button>
            </div>

            {/* Caption editor */}
            <div style={{padding:"18px",flex:1,display:"flex",flexDirection:"column",gap:"12px",minWidth:"280px"}}>
              <div>
                <div style={{fontSize:"8px",fontFamily:"'Orbitron',monospace",color:C.muted,letterSpacing:"0.12em",marginBottom:"6px"}}>CAPTION (EDITABLE)</div>
                <textarea
                  value={caption}
                  onChange={e=>setCaption(e.target.value)}
                  style={{...inp,height:"120px",resize:"vertical",lineHeight:"1.6"}}
                />
                <div style={{fontSize:"9px",color:C.muted,marginTop:"4px",fontFamily:"'Share Tech Mono',monospace",textAlign:"right"}}>{caption.length} chars</div>
              </div>

              <div>
                <div style={{fontSize:"8px",fontFamily:"'Orbitron',monospace",color:C.muted,letterSpacing:"0.12em",marginBottom:"6px"}}>HASHTAGS (EDITABLE)</div>
                <textarea
                  value={hashtags}
                  onChange={e=>setHashtags(e.target.value)}
                  style={{...inp,height:"60px",resize:"vertical",lineHeight:"1.6",color:C.accent}}
                />
              </div>

              <div style={{background:C.bg0,border:`1px solid ${C.border}`,borderRadius:"4px",padding:"10px 12px"}}>
                <div style={{fontSize:"8px",fontFamily:"'Orbitron',monospace",color:C.muted,letterSpacing:"0.12em",marginBottom:"6px"}}>FULL POST PREVIEW</div>
                <div style={{fontSize:"11px",color:C.text,lineHeight:"1.6",fontFamily:"'Share Tech Mono',monospace"}}>{caption}</div>
                <div style={{fontSize:"11px",color:C.accent,marginTop:"6px",fontFamily:"'Share Tech Mono',monospace"}}>{hashtags}</div>
              </div>

              <button onClick={copyAll} style={{...btn,width:"100%",color:copied?"#22dd77":"#cc88ff",border:`1px solid ${copied?"#22dd7744":"#cc88ff44"}`,padding:"10px",fontFamily:"'Orbitron',monospace",fontSize:"10px",letterSpacing:"0.1em",transition:"all 0.2s"}}>
                {copied?"✓ COPIED!":"📋 COPY CAPTION + HASHTAGS"}
              </button>

              <div style={{fontSize:"9px",color:C.muted,textAlign:"center",fontFamily:"'Share Tech Mono',monospace",lineHeight:1.5}}>
                Download the image, copy the caption, then paste manually into Instagram, X, or any platform.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   AI CHAT DRAWER
══════════════════════════════════════════════════════════════════════════════ */

function AIChatDrawer({open,onToggle,dashboardState}) {
  const [messages,setMessages]=useState([
    {role:"assistant",content:"Hello. I'm your AVOSINT AI analyst. I can answer questions about aviation safety, regulations, aircraft, incidents, and the data currently displayed on your dashboard. What would you like to know?"}
  ]);
  const [input,setInput]=useState("");
  const [streaming,setStreaming]=useState(false);
  const [context,setContext]=useState("dashboard"); // dashboard | general
  const msgEndRef=useRef(null);
  const inputRef=useRef(null);

  useEffect(()=>{
    if(open && msgEndRef.current) msgEndRef.current.scrollIntoView({behavior:"smooth"});
  },[messages,open]);

  useEffect(()=>{
    if(open && inputRef.current) inputRef.current.focus();
  },[open]);

  const sendMessage=async()=>{
    const text=input.trim();
    if(!text||streaming) return;
    setInput("");
    const userMsg={role:"user",content:text};
    setMessages(m=>[...m,userMsg]);
    setStreaming(true);

    const systemPrompt=buildChatSystemPrompt(context,dashboardState);
    const history=[...messages,userMsg].map(m=>({role:m.role,content:m.content}));

    const assistantMsg={role:"assistant",content:""};
    setMessages(m=>[...m,assistantMsg]);

    try {
      const res=await fetch("/api/analyze",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1000,
          system:systemPrompt,
          messages:history,
        }),
      });
      const data=await res.json();
      if(!res.ok) throw new Error(data?.error||`API ${res.status}`);
      const text=data?.content?.[0]?.text||"";
      setMessages(m=>{
        const updated=[...m];
        updated[updated.length-1]={...updated[updated.length-1],content:text};
        return updated;
      });
    } catch(err) {
      setMessages(m=>{
        const updated=[...m];
        updated[updated.length-1]={...updated[updated.length-1],content:`Error: ${err.message}`};
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  };

  const drawerHeight=open?"42vh":"38px";

  return (
    <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:2000,height:drawerHeight,transition:"height 0.3s cubic-bezier(0.4,0,0.2,1)",background:C.bg1,borderTop:`1px solid ${C.accent}33`,display:"flex",flexDirection:"column",boxShadow:"0 -8px 32px rgba(0,0,0,0.6)"}}>
      {/* Toggle bar */}
      <div onClick={onToggle} style={{height:"38px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",flexShrink:0,borderBottom:open?`1px solid ${C.border}`:"none",userSelect:"none"}}>
        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
          <span style={{color:C.accent,fontSize:"14px",filter:`drop-shadow(0 0 6px ${C.accent})`}}>◈</span>
          <span style={{fontFamily:"'Orbitron',monospace",fontSize:"9px",color:C.accent,letterSpacing:"0.15em"}}>AI AVIATION ANALYST</span>
          {streaming&&<span style={{fontSize:"9px",color:"#cc88ff",fontFamily:"'Share Tech Mono',monospace",animation:"blink 0.6s step-end infinite"}}>● THINKING…</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          {open&&(
            <div style={{display:"flex",gap:"4px"}}>
              {[["dashboard","🔭 Dashboard"],["general","💬 General"]].map(([id,label])=>(
                <button key={id} onClick={e=>{e.stopPropagation();setContext(id);}} style={{...btn,fontSize:"9px",padding:"3px 8px",color:context===id?C.accent:C.muted,border:`1px solid ${context===id?C.accent+"55":C.border}`,background:context===id?`${C.accent}11`:"transparent",fontFamily:"'Orbitron',monospace",letterSpacing:"0.06em"}}>
                  {label}
                </button>
              ))}
              <button onClick={e=>{e.stopPropagation();setMessages(m=>m.slice(0,1));}} style={{...btn,fontSize:"9px",padding:"3px 8px",color:C.muted}}>CLEAR</button>
            </div>
          )}
          <span style={{color:C.muted,fontSize:"12px",fontFamily:"monospace"}}>{open?"▼":"▲"}</span>
        </div>
      </div>

      {/* Chat content */}
      {open&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {/* Messages */}
          <div style={{flex:1,overflow:"auto",padding:"12px 16px",display:"flex",flexDirection:"column",gap:"10px"}}>
            {messages.map((msg,i)=>(
              <div key={i} style={{display:"flex",flexDirection:"column",alignItems:msg.role==="user"?"flex-end":"flex-start",gap:"3px"}}>
                <div style={{fontSize:"8px",color:C.muted,fontFamily:"'Orbitron',monospace",letterSpacing:"0.1em",padding:"0 4px"}}>
                  {msg.role==="user"?"YOU":"AI ANALYST"}
                </div>
                <div style={{maxWidth:"75%",padding:"10px 14px",borderRadius:"8px",background:msg.role==="user"?`${C.accent}18`:C.card,border:`1px solid ${msg.role==="user"?C.accent+"33":C.border}`,fontSize:"12px",lineHeight:"1.65",color:C.text,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
                  {msg.content}
                  {i===messages.length-1&&streaming&&msg.role==="assistant"&&(
                    <span style={{display:"inline-block",width:"7px",height:"13px",background:"#cc88ff",marginLeft:"2px",animation:"blink 0.7s step-end infinite",verticalAlign:"text-bottom"}}/>
                  )}
                </div>
              </div>
            ))}
            <div ref={msgEndRef}/>
          </div>

          {/* Input */}
          <div style={{padding:"10px 16px",borderTop:`1px solid ${C.border}`,display:"flex",gap:"8px",flexShrink:0}}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}}}
              placeholder={context==="dashboard"?"Ask about events on screen, live flights, or general aviation…":"Ask anything about aviation safety, regulations, aircraft, procedures…"}
              style={{...inp,flex:1,height:"40px",fontSize:"12px"}}
              disabled={streaming}
            />
            <button
              onClick={sendMessage}
              disabled={streaming||!input.trim()}
              style={{...btn,padding:"0 18px",color:streaming||!input.trim()?C.muted:C.accent,border:`1px solid ${streaming||!input.trim()?C.border:C.accent+"55"}`,background:C.dim,height:"40px",flexShrink:0,fontSize:"16px"}}
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN DASHBOARD
══════════════════════════════════════════════════════════════════════════════ */

export default function AviationDashboard() {

  // ── Filter state ──────────────────────────────────────────────────────────
  const [region,setRegion]=useState("global");
  const [carrier,setCarrier]=useState("All Carriers");
  const [aircraftCat,setAircraftCat]=useState("All Types");
  const [searchText,setSearchText]=useState("");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [eventTypes,setEventTypes]=useState({accident:true,incident:true,military:true,vip:true,live:true,asrs:true,sdr:true,asias:true});
  const [squawkFilter,setSquawkFilter]=useState([]);
  const [onGroundHide,setOnGroundHide]=useState(false);

  // ── Data state ────────────────────────────────────────────────────────────
  const [flights,setFlights]=useState([]);
  const [apiStatus,setApiStatus]=useState("idle");
  const [lastUpdated,setLastUpdated]=useState(null);
  const [selectedEvent,setSelectedEvent]=useState(null);

  // ── Live incident data (ASRS + SDR + ASIAS) ─────────────────────────────
  const [incidents,setIncidents]=useState([]);
  const [incidentsStatus,setIncidentsStatus]=useState("idle"); // idle|loading|ok|error
  const [incidentsUpdated,setIncidentsUpdated]=useState(null);
  // Per-source status so sidebar can show individual health
  const [asrsStatus,setAsrsStatus]=useState("idle");
  const [sdrStatus,setSdrStatus]=useState("idle");
  const [asiasStatus,setAsiasStatus]=useState("idle");

  // ── ACARS data ────────────────────────────────────────────────────────────
  const [acarsMessages,setAcarsMessages]=useState([]);
  const [acarsStatus,setAcarsStatus]=useState("idle");
  const [acarsUpdated,setAcarsUpdated]=useState(null);
  const [acarsAlerts,setAcarsAlerts]=useState([]); // AI-flagged messages
  const [acarsAiRunning,setAcarsAiRunning]=useState(false);
  const acarsApiAvailable=useRef(null); // null=unknown, true=ok, false=no key

  // ── Weather state ─────────────────────────────────────────────────────────
  const [delaysEnabled,setDelaysEnabled]=useState(false);
  const [turbulenceEnabled,setTurbulenceEnabled]=useState(false);
  const [weatherData,setWeatherData]=useState(null);
  const [weatherLoading,setWeatherLoading]=useState(false);
  const weatherLayerRef=useRef(null);
  const delayLayerRef=useRef(null);

  // ── Post modal state ──────────────────────────────────────────────────────
  const [postModal,setPostModal]=useState({open:false,event:null,generating:false,imageUrl:null,caption:null});
  const [generatingEventId,setGeneratingEventId]=useState(null);

  // ── Analysis state ────────────────────────────────────────────────────────
  const [analysisText,setAnalysisText]=useState("");
  const [analysisStatus,setAnalysisStatus]=useState("idle");
  const [analysisMeta,setAnalysisMeta]=useState(null);
  const [analysisMode,setAnalysisMode]=useState("safety");

  // ── UI state ──────────────────────────────────────────────────────────────
  const [leafletReady,setLeafletReady]=useState(false);
  const [activeTab,setActiveTab]=useState("events");
  const [chatOpen,setChatOpen]=useState(false);

  // ── Notification state ────────────────────────────────────────────────────
  const [notifPermission,setNotifPermission]=useState(
    typeof Notification!=="undefined" ? Notification.permission : "unsupported"
  );
  const [notifEnabled,setNotifEnabled]=useState(false);
  const [recentNotifs,setRecentNotifs]=useState([]); // for in-dashboard log
  const notifiedSquawksRef   = useRef(new Set());     // icao24+squawk already alerted
  const notifiedIncidentsRef = useRef(new Set());     // incident ids already alerted
  const initialIncidentLoad  = useRef(false);         // skip notification on first render

  // ── Map refs ──────────────────────────────────────────────────────────────
  const mapDivRef=useRef(null);
  const mapRef=useRef(null);
  const flightLayerRef=useRef(null);
  const incidentLayerRef=useRef(null);

  /* ── Leaflet ─────────────────────────────────────────────────────────── */
  useEffect(()=>{
    if(window.L){setLeafletReady(true);return;}
    const css=document.createElement("link");
    css.rel="stylesheet";
    css.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
    const js=document.createElement("script");
    js.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    js.onload=()=>setLeafletReady(true);
    document.head.appendChild(js);
  },[]);

  /* ── Request notification permission ────────────────────────────────── */
  const requestNotifPermission=useCallback(async()=>{
    if(typeof Notification==="undefined") return;
    if(Notification.permission==="granted"){
      setNotifPermission("granted");
      setNotifEnabled(true);
      return;
    }
    const result=await Notification.requestPermission();
    setNotifPermission(result);
    if(result==="granted") setNotifEnabled(true);
  },[]);

  /* ── Core notification sender ────────────────────────────────────────── */
  const sendNotif=useCallback((title,body,tag,urgency="normal")=>{
    if(!notifEnabled||Notification.permission!=="granted") return;

    // Play a subtle audio tone for emergencies
    if(urgency==="urgent"){
      try{
        const ctx=new(window.AudioContext||window.webkitAudioContext)();
        [880,1100,880].forEach((freq,i)=>{
          const osc=ctx.createOscillator();
          const gain=ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.frequency.value=freq;
          osc.type="sine";
          gain.gain.setValueAtTime(0,ctx.currentTime+i*0.18);
          gain.gain.linearRampToValueAtTime(0.25,ctx.currentTime+i*0.18+0.05);
          gain.gain.linearRampToValueAtTime(0,ctx.currentTime+i*0.18+0.16);
          osc.start(ctx.currentTime+i*0.18);
          osc.stop(ctx.currentTime+i*0.18+0.18);
        });
      }catch{}
    }

    const n=new Notification(title,{
      body,
      tag,           // prevents duplicate system notifications with same tag
      icon:"/favicon.ico",
      badge:"/favicon.ico",
      requireInteraction: urgency==="urgent",
    });

    // Clicking the notification focuses the tab
    n.onclick=()=>{ window.focus(); n.close(); };

    // Log to in-dashboard notification history
    setRecentNotifs(prev=>[
      {id:`${tag}_${Date.now()}`,title,body,time:new Date().toLocaleTimeString(),urgency},
      ...prev.slice(0,49),
    ]);
  },[notifEnabled]);

  /* ── Init map ────────────────────────────────────────────────────────── */
  useEffect(()=>{
    if(!leafletReady||!mapDivRef.current||mapRef.current) return;
    const L=window.L;
    const r=REGIONS[region];
    const map=L.map(mapDivRef.current,{center:r.center,zoom:r.zoom,zoomControl:false,attributionControl:false});
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{subdomains:"abcd",maxZoom:19}).addTo(map);
    L.control.zoom({position:"bottomright"}).addTo(map);
    L.control.attribution({prefix:'<a href="https://carto.com" style="color:#3a6080">© CartoDB</a> | OpenSky Network | NTSB/FAA/EASA (sample) | NOAA'}).addTo(map);
    flightLayerRef.current=L.layerGroup().addTo(map);
    incidentLayerRef.current=L.layerGroup().addTo(map);
    weatherLayerRef.current=L.layerGroup().addTo(map);
    delayLayerRef.current=L.layerGroup().addTo(map);
    mapRef.current=map;
  },[leafletReady]);

  /* ── Region fly-to ───────────────────────────────────────────────────── */
  useEffect(()=>{
    if(!mapRef.current) return;
    const r=REGIONS[region];
    mapRef.current.flyTo(r.center,r.zoom,{duration:1.5,easeLinearity:0.3});
  },[region]);

  /* ── Fetch OpenSky ───────────────────────────────────────────────────── */
  const fetchFlights=useCallback(async()=>{
    setApiStatus("loading");
    try{
      const r=REGIONS[region];
      let url="https://opensky-network.org/api/states/all";
      if(r.bbox){const{lamin,lomin,lamax,lomax}=r.bbox;url+=`?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;}
      const resp=await fetch(url,{signal:AbortSignal.timeout(18000)});
      if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data=await resp.json();
      setFlights((data.states||[]).filter(s=>s[5]!=null&&s[6]!=null));
      setApiStatus("ok");
      setLastUpdated(new Date());
    }catch{setApiStatus("error");}
  },[region]);

  useEffect(()=>{
    fetchFlights();
    const iv=setInterval(fetchFlights,45000);
    return()=>clearInterval(iv);
  },[fetchFlights]);

  /* ── Fetch incidents: ASRS + SDR ────────────────────────────────────────── */
  // fetchIncidents accepts optional date overrides for historical queries.
  // IMPORTANT: ASIAS data is always limited to the last 10 business days
  // regardless of the date range requested — this is an FAA constraint.
  // ASRS and SDR will honour the full requested date range.
  const fetchIncidents=useCallback(async(fromDate,toDate)=>{
    setIncidentsStatus("loading");
    setAsrsStatus("loading");
    setSdrStatus("loading");
    setAsiasStatus("loading");
    try {
      const qFrom=fromDate||"";
      const qTo  =toDate  ||"";
      const qs   =qFrom||qTo?`?from=${encodeURIComponent(qFrom)}&to=${encodeURIComponent(qTo)}`:"";
      const [asrsRes,sdrRes,asiasRes]=await Promise.allSettled([
        fetch(`/api/asrs${qs}`).then(r=>r.json()),
        fetch(`/api/sdr${qs}` ).then(r=>r.json()),
        fetch("/api/asias"    ).then(r=>r.json()), // ASIAS ignores date range — 10bd window only
      ]);
      const asrsEvents =asrsRes.status==="fulfilled" ?(asrsRes.value.events ||[]):[];
      const sdrEvents  =sdrRes.status==="fulfilled"  ?(sdrRes.value.events  ||[]):[];
      const asiasEvents=asiasRes.status==="fulfilled"?(asiasRes.value.events||[]):[];
      setAsrsStatus (asrsRes.status==="fulfilled"  && !asrsRes.value.error  ?"ok":"error");
      setSdrStatus  (sdrRes.status==="fulfilled"   && !sdrRes.value.error   ?"ok":"error");
      setAsiasStatus(asiasRes.status==="fulfilled" && !asiasRes.value.error ?"ok":"error");
      // Merge and deduplicate (ASIAS may overlap ASRS on recent events)
      const allEvents=[...asiasEvents,...asrsEvents,...sdrEvents];
      const seen=new Set();
      const combined=allEvents
        .filter(ev=>{ const k=`${ev.date}-${ev.aircraft}-${ev.location}`; if(seen.has(k))return false; seen.add(k); return true; })
        .sort((a,b)=>b.date.localeCompare(a.date));
      setIncidents(combined);
      setIncidentsStatus("ok");
      setIncidentsUpdated(new Date());
    } catch(err){
      console.error("fetchIncidents error:",err);
      setIncidentsStatus("error");
    }
  },[]);

  useEffect(()=>{
    fetchIncidents();
    const iv=setInterval(fetchIncidents,30*60*1000);
    return ()=>clearInterval(iv);
  },[fetchIncidents]);

  /* ── Fetch ACARS messages ────────────────────────────────────────────────── */
  const fetchAcars=useCallback(async()=>{
    if(acarsApiAvailable.current===false) return;
    setAcarsStatus("loading");
    try {
      const data=await fetch("/api/acars").then(r=>r.json());
      if(data.error?.includes("AIRFRAMES_API_KEY")){
        acarsApiAvailable.current=false;
        setAcarsStatus("nokey");
        return;
      }
      acarsApiAvailable.current=true;
      setAcarsMessages((data.messages||[]).slice(0,200));
      setAcarsUpdated(new Date());
      setAcarsStatus("ok");
    } catch(err){
      console.error("fetchAcars error:",err);
      setAcarsStatus("error");
    }
  },[]);

  useEffect(()=>{
    fetchAcars();
    const iv=setInterval(fetchAcars,2*60*1000);
    return ()=>clearInterval(iv);
  },[fetchAcars]);

  /* ── ACARS AI triage ─────────────────────────────────────────────────────── */
  const runAcarsAi=useCallback(async()=>{
    if(acarsMessages.length===0||acarsAiRunning) return;
    setAcarsAiRunning(true);
    try {
      const sample=acarsMessages.slice(0,30).map(m=>
        `[${m.callsign}|${m.label||"?"}] ${m.text.slice(0,120)}`
      ).join("\n");
      const res=await fetch("/api/analyze",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:800,
          system:`You are an aviation OSINT analyst. Analyze these ACARS messages for operationally significant events.
Flag messages that indicate: emergencies, mechanical issues, diversions, medical events, fuel emergencies, ATC abnormalities, or other non-routine events.
Respond ONLY with valid JSON: {"alerts":[{"id":"<callsign>","callsign":"<cs>","summary":"<1 sentence>","severity":"high|medium|low"}]}
If nothing notable, respond: {"alerts":[]}`,
          messages:[{role:"user",content:`Analyze these ACARS messages:\n${sample}`}],
        }),
      });
      const data=await res.json();
      const text=data?.content?.[0]?.text||"{}";
      const parsed=JSON.parse(text.replace(/```json|```/g,"").trim());
      if(parsed.alerts?.length>0) setAcarsAlerts(parsed.alerts);
    } catch(err){
      console.error("ACARS AI error:",err);
    } finally {
      setAcarsAiRunning(false);
    }
  },[acarsMessages,acarsAiRunning]);

  // Run AI triage when new ACARS messages arrive (only if key is set)
  useEffect(()=>{
    if(acarsMessages.length>0&&acarsApiAvailable.current===true){
      const t=setTimeout(runAcarsAi,3000);
      return ()=>clearTimeout(t);
    }
  },[acarsMessages]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Fetch Weather ───────────────────────────────────────────────────── */
  const fetchWeather=useCallback(async()=>{
    if(!delaysEnabled&&!turbulenceEnabled) return;
    setWeatherLoading(true);
    try{
      const res=await fetch("/api/weather",{signal:AbortSignal.timeout(15000)});
      if(res.ok){const data=await res.json();setWeatherData(data);}
    }catch(e){console.warn("Weather fetch failed:",e);}
    finally{setWeatherLoading(false);}
  },[delaysEnabled,turbulenceEnabled]);

  useEffect(()=>{
    fetchWeather();
    const iv=setInterval(fetchWeather,300000); // every 5 min
    return()=>clearInterval(iv);
  },[fetchWeather]);

  /* ── Weather map layers ──────────────────────────────────────────────── */
  useEffect(()=>{
    if(!leafletReady||!weatherLayerRef.current) return;
    const L=window.L;
    weatherLayerRef.current.clearLayers();
    if(!turbulenceEnabled||!weatherData) return;

    // Render AIRMET turbulence polygons
    const renderGeoJSON=(collection,color,label)=>{
      if(!collection?.features) return;
      try{
        L.geoJSON(collection,{
          style:{color,weight:2,fillColor:color,fillOpacity:0.15,dashArray:"6 4"},
          onEachFeature:(feature,layer)=>{
            const p=feature.properties||{};
            layer.bindPopup(`
              <div style="background:#06101a;color:#c8dff0;border-radius:6px;padding:10px;font-family:'Share Tech Mono',monospace;font-size:11px;border:1px solid #0f2d4a;min-width:200px">
                <div style="color:${color};font-weight:bold;margin-bottom:6px;font-size:12px">${label}</div>
                <div style="color:#3a6080">HAZARD</div><div>${p.hazard||p.type||"TURBULENCE"}</div>
                <div style="color:#3a6080;margin-top:4px">VALID</div><div>${p.validTimeFrom||p.validTime||"See NOTAM"}</div>
                ${p.severity?`<div style="color:#3a6080;margin-top:4px">SEVERITY</div><div>${p.severity}</div>`:""}
                ${p.altitudeLow?`<div style="color:#3a6080;margin-top:4px">ALTITUDE</div><div>${p.altitudeLow}–${p.altitudeHigh||"UNL"}</div>`:""}
              </div>`,{className:"av-popup"});
          }
        }).addTo(weatherLayerRef.current);
      }catch{}
    };

    renderGeoJSON(weatherData.airmets,"#ff8c00","⚡ AIRMET — TURBULENCE");
    renderGeoJSON(weatherData.sigmets,"#ff4444","🔴 SIGMET — SEVERE TURBULENCE");

  },[turbulenceEnabled,weatherData,leafletReady]);

  useEffect(()=>{
    if(!leafletReady||!delayLayerRef.current) return;
    const L=window.L;
    delayLayerRef.current.clearLayers();
    if(!delaysEnabled) return;

    const delayMap={};
    (weatherData?.delays||[]).forEach(d=>{ if(d.airport) delayMap[d.airport]=(delayMap[d.airport]||[]).concat(d); });

    MAJOR_AIRPORTS.forEach(ap=>{
      const airportDelays=delayMap[ap.iata]||[];
      const hasGroundStop=airportDelays.some(d=>d.type==="Ground Stop");
      const hasDelay=airportDelays.length>0;
      const color=hasGroundStop?"#ff3b3b":hasDelay?"#ffb300":"#22dd77";
      const size=hasDelay?16:10;

      const icon=L.divIcon({
        html:`<div style="position:relative">
          <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 ${hasDelay?12:6}px ${color};display:flex;align-items:center;justify-content:center">
            ${hasDelay?`<span style="font-size:${size>12?8:6}px;color:white;font-weight:bold">✈</span>`:""}
          </div>
        </div>`,
        className:"",iconSize:[size,size],iconAnchor:[size/2,size/2]
      });

      L.marker([ap.lat,ap.lon],{icon}).bindPopup(`
        <div style="background:#06101a;color:#c8dff0;border-radius:6px;padding:10px 12px;font-family:'Share Tech Mono',monospace;font-size:11px;border:1px solid #0f2d4a;min-width:220px">
          <div style="font-weight:bold;color:${color};margin-bottom:6px;font-size:13px">✈ ${ap.iata} — ${ap.name}</div>
          ${hasGroundStop?`<div style="background:#ff3b3b22;border:1px solid #ff3b3b44;border-radius:4px;padding:5px 8px;margin-bottom:6px;color:#ff3b3b;font-weight:bold">🔴 GROUND STOP IN EFFECT</div>`:""}
          ${hasDelay&&!hasGroundStop?`<div style="background:#ffb30022;border:1px solid #ffb30044;border-radius:4px;padding:5px 8px;margin-bottom:6px;color:#ffb300">⚠ DELAYS REPORTED</div>`:""}
          ${airportDelays.map(d=>`
            <div style="margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid #0f2d4a">
              <div style="color:#3a6080">${d.type}</div>
              <div>${d.reason||"N/A"}</div>
              ${d.avg?`<div style="color:#ffb300">${d.avg}</div>`:""}
              ${d.trend?`<div style="color:#3a6080">Trend: ${d.trend}</div>`:""}
            </div>`).join("")}
          ${!hasDelay?`<div style="color:#22dd77">✓ No delays reported</div>`:""}
          <div style="font-size:9px;color:#3a6080;margin-top:6px">Source: FAA NASSTATUS</div>
        </div>`,{className:"av-popup"}).addTo(delayLayerRef.current);
    });

  },[delaysEnabled,weatherData,leafletReady]);

  /* ── Filtered data ───────────────────────────────────────────────────── */
  const filteredIncidents=useMemo(()=>incidents.filter(ev=>{
    // Source toggles: ASRS / SDR
    if(ev.source==="ASRS" &&!eventTypes.asrs)  return false;
    if(ev.source==="SDR"  &&!eventTypes.sdr)   return false;
    if(ev.source==="ASIAS"&&!eventTypes.asias)  return false;
    // Type toggles (accident / incident / military / vip)
    if(ev.type&&!eventTypes[ev.type]) return false;
    if(carrier!=="All Carriers"&&ev.carrier!==carrier) return false;
    if(aircraftCat!=="All Types"&&ev.category!==aircraftCat) return false;
    if(dateFrom&&ev.date<dateFrom) return false;
    if(dateTo&&ev.date>dateTo) return false;
    if(searchText){const q=searchText.toLowerCase();if(!`${ev.aircraft||""} ${ev.carrier||""} ${ev.location||""} ${ev.description||""}`.toLowerCase().includes(q))return false;}
    return true;
  }),[incidents,eventTypes,carrier,aircraftCat,dateFrom,dateTo,searchText]);

  // Military callsign prefixes (ICAO designators for military operators)
  const MILITARY_PREFIXES=new Set(["RCH","RRR","USAF","DUKE","BART","JAKE","DARK","KILL","SLAM","BONE","BUCK","FURY","KNIFE","HAWK","EAGLE","VIPER","GHOST","STORM","SABER","TIGER","WOLF","COLT","BISON","REACH","STING","SWORD","BRONCO","COBRA","RAZER","IRON","STEEL","BOXER","TORCH","MAGIC"]);
  const isMilitaryCallsign=(cs)=>{
    if(!cs) return false;
    const u=cs.trim().toUpperCase();
    // USAF/NATO callsigns: alpha prefix followed by numbers
    if(/^(RCH|RRR|DUKE|BART|JAKE|DARK|KILL|SLAM|BONE|BUCK|FURY|KNIFE|HAWK|EAGLE|VIPER|GHOST|STORM|SABER|TIGER|WOLF|COLT|BISON|REACH|STING|SWORD|BRONCO|COBRA|RAZER|IRON|STEEL|BOXER|TORCH|MAGIC)\d/.test(u)) return true;
    // Generic military pattern: all-alpha prefix ≥4 chars + digits (e.g. USAF123)
    if(/^[A-Z]{4,}\d+$/.test(u)) return true;
    return false;
  };

  const filteredFlights=useMemo(()=>flights.filter(s=>{
    if(onGroundHide&&s[8]) return false;
    if(squawkFilter.length>0&&!squawkFilter.includes(s[14])) return false;
    if(!eventTypes.live&&!EMERGENCY_SQUAWKS[s[14]]) return false;
    if(carrier!=="All Carriers"){
      const cs=(s[1]||"").trim().toUpperCase();
      const mappedCarrier=CARRIER_CALLSIGN_MAP[cs.slice(0,3)];
      if(mappedCarrier!==carrier) return false;
    }
    // Aircraft category filter — best-effort based on callsign patterns
    if(aircraftCat!=="All Types"){
      const cs=(s[1]||"").trim().toUpperCase();
      const isMil=isMilitaryCallsign(cs);
      const isCargo=["FDX","UPS","GTI","ABX","ATN","CLX","NPT","BCS","DHK"].includes(cs.slice(0,3));
      if(aircraftCat==="Military"    && !isMil)   return false;
      if(aircraftCat==="Cargo"       && !isCargo) return false;
      if(aircraftCat==="Military"||aircraftCat==="Cargo"){/* already handled */}
      // For commercial categories, hide known military and cargo
      else if(["Commercial Jet","Narrowbody","Widebody Heavy","Turboprop"].includes(aircraftCat)){
        if(isMil||isCargo) return false;
      }
    }
    if(searchText){const q=searchText.toLowerCase();if(!`${s[1]} ${s[2]} ${s[14]}`.toLowerCase().includes(q))return false;}
    return true;
  }),[flights,squawkFilter,eventTypes,searchText,onGroundHide,carrier,aircraftCat]);

  /* ── Flight markers ──────────────────────────────────────────────────── */
  useEffect(()=>{
    if(!leafletReady||!flightLayerRef.current) return;
    const L=window.L;
    flightLayerRef.current.clearLayers();
    filteredFlights.slice(0,2500).forEach(s=>{
      const[icao24,callsign,country,,, lon,lat,balt,onGround,vel,track,,,, squawk]=s;
      if(!lat||!lon) return;
      const isEmg=EMERGENCY_SQUAWKS[squawk];
      const color=isEmg?(SQUAWK_COLORS[squawk]||C.danger):C.safe;
      const sz=isEmg?22:13;
      const icon=L.divIcon({html:`<div style="color:${color};font-size:${sz}px;transform:rotate(${track||0}deg);filter:drop-shadow(0 0 4px ${color}88);line-height:1">✈</div>`,className:"",iconSize:[sz,sz],iconAnchor:[sz/2,sz/2]});
      const altFt=balt?Math.round(balt*3.281).toLocaleString():"N/A";
      const spdKts=vel?Math.round(vel*1.944):"N/A";
      const vRpm=s[11]?Math.round(s[11]*197):0;
      L.marker([lat,lon],{icon}).bindPopup(`
        <div style="background:#06101a;color:#c8dff0;border-radius:6px;padding:12px;min-width:210px;font-family:'Share Tech Mono',monospace;font-size:11px;border:1px solid #0f2d4a">
          <div style="font-size:13px;font-weight:bold;color:${color};margin-bottom:6px;font-family:'Orbitron',monospace">${callsign?.trim()||icao24?.toUpperCase()||"UNKNOWN"}</div>
          ${isEmg?`<div style="background:${color}22;border:1px solid ${color}66;border-radius:4px;padding:5px 8px;margin-bottom:8px;color:${color};font-weight:bold">⚠ SQK ${squawk} — ${EMERGENCY_SQUAWKS[squawk]}</div>`:""}
          <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 10px">
            <span style="color:#3a6080">ICAO24</span><span>${icao24?.toUpperCase()}</span>
            <span style="color:#3a6080">ORIGIN</span><span>${country}</span>
            <span style="color:#3a6080">ALT</span><span>${altFt} ft</span>
            <span style="color:#3a6080">SPEED</span><span>${spdKts} kts</span>
            <span style="color:#3a6080">HDG</span><span>${track!=null?track+"°":"N/A"}</span>
            <span style="color:#3a6080">VRATE</span><span>${vRpm>0?"↑":vRpm<0?"↓":"→"} ${Math.abs(vRpm)} fpm</span>
            <span style="color:#3a6080">SQK</span><span style="color:${isEmg?color:"#c8dff0"}">${squawk||"N/A"}</span>
            <span style="color:#3a6080">STATUS</span><span style="color:${onGround?"#ffb300":"#22dd77"}">${onGround?"ON GROUND":"AIRBORNE"}</span>
          </div>
        </div>`,{maxWidth:300,className:"av-popup"}).addTo(flightLayerRef.current);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[filteredFlights,leafletReady]);

  /* ── Incident markers ────────────────────────────────────────────────── */
  useEffect(()=>{
    if(!leafletReady||!incidentLayerRef.current) return;
    const L=window.L;
    incidentLayerRef.current.clearLayers();
    filteredIncidents.forEach(ev=>{
      if(ev.lat==null||ev.lon==null) return; // skip events without coordinates
      const sev=SEVERITY_META[ev.severity]||SEVERITY_META.medium;
      const meta=EVENT_META[ev.type]||EVENT_META.incident;
      const icon=L.divIcon({html:`<div style="width:16px;height:16px;border-radius:50%;background:${sev.color};border:2px solid white;box-shadow:0 0 10px ${sev.color}"></div>`,className:"",iconSize:[18,18],iconAnchor:[9,9]});
      const marker=L.marker([ev.lat,ev.lon],{icon});
      marker.bindPopup(`
        <div style="background:#06101a;color:#c8dff0;border-radius:6px;padding:12px;min-width:220px;font-family:sans-serif;font-size:11px;border:1px solid #0f2d4a">
          <div style="color:${sev.color};font-weight:bold;margin-bottom:4px;font-family:'Share Tech Mono',monospace">${meta.icon} ${ev.type.toUpperCase()} — ${sev.label}</div>
          <div style="font-weight:bold;font-size:13px;margin-bottom:5px">${ev.aircraft}</div>
          <div style="color:#00b4ff;margin-bottom:3px">${ev.carrier||"Independent"}</div>
          <div style="color:#3a6080;font-size:10px;margin-bottom:8px">${ev.location} · ${ev.date}</div>
          <div style="line-height:1.5;border-top:1px solid #0f2d4a;padding-top:8px">${ev.description.slice(0,180)}…</div>
          ${ev.fatalities>0?`<div style="color:#ff3b3b;font-weight:bold;margin-top:6px">⚫ ${ev.fatalities} FATALITY</div>`:""}
        </div>`,{maxWidth:300,className:"av-popup"});
      marker.on("click",()=>setSelectedEvent(ev));
      incidentLayerRef.current.addLayer(marker);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[filteredIncidents,leafletReady]);

  /* ── Notify: emergency squawks ───────────────────────────────────────── */
  useEffect(()=>{
    if(!notifEnabled) return;
    flights.filter(s=>EMERGENCY_SQUAWKS[s[14]]).forEach(s=>{
      const key=`${s[0]}_${s[14]}`;
      if(notifiedSquawksRef.current.has(key)) return;
      notifiedSquawksRef.current.add(key);
      const callsign=s[1]?.trim()||s[0]?.toUpperCase()||"UNKNOWN";
      const alt=s[7]?`${Math.round(s[7]*3.281).toLocaleString()} ft`:"altitude unknown";
      const country=s[2]||"unknown origin";
      sendNotif(
        `⚠ EMERGENCY SQUAWK ${s[14]}`,
        `${callsign} (${country}) · ${EMERGENCY_SQUAWKS[s[14]]} · ${alt}`,
        `sqk_${key}`,
        "urgent"
      );
    });
  },[flights,notifEnabled,sendNotif]);

  /* ── Notify: new incidents/accidents (needs filteredIncidents — defined above) ── */
  useEffect(()=>{
    if(!initialIncidentLoad.current){
      filteredIncidents.forEach(ev=>notifiedIncidentsRef.current.add(ev.id));
      initialIncidentLoad.current=true;
      return;
    }
    if(!notifEnabled) return;
    filteredIncidents.forEach(ev=>{
      if(notifiedIncidentsRef.current.has(ev.id)) return;
      notifiedIncidentsRef.current.add(ev.id);
      const isAccident=ev.type==="accident";
      const urgency=(ev.severity==="critical"||ev.severity==="high")?"urgent":"normal";
      sendNotif(
        `${isAccident?"💥 ACCIDENT":"⚠ INCIDENT"} · ${ev.severity.toUpperCase()}`,
        `${ev.aircraft} · ${ev.location} · ${ev.phase} · Source: ${ev.source}`,
        `ev_${ev.id}`,
        urgency
      );
    });
  },[filteredIncidents,notifEnabled,sendNotif]);

  /* ── Generate post ───────────────────────────────────────────────────── */
  const generatePost=useCallback(async(ev)=>{
    setGeneratingEventId(ev.id);
    setPostModal({open:true,event:ev,generating:true,imageUrl:null,caption:null});

    try{
      const imageUrl=generatePostImage(ev);
      const res=await fetch("/api/analyze",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:400,
          messages:[{role:"user",content:buildCaptionPrompt(ev)}],
        }),
      });
      const data=await res.json();
      const caption=data.content?.[0]?.text?.trim()||"Aviation event report — see AVOSINT for details.";
      setPostModal({open:true,event:ev,generating:false,imageUrl,caption});
    }catch(err){
      setPostModal({open:true,event:ev,generating:false,imageUrl:null,caption:`Error: ${err.message}`});
    }finally{
      setGeneratingEventId(null);
    }
  },[]);

  /* ── Run analysis ────────────────────────────────────────────────────── */
  const runAnalysis=useCallback(async()=>{
    if(filteredIncidents.length===0) return;
    setAnalysisStatus("loading");
    setAnalysisText("");
    setActiveTab("analysis");
    setAnalysisMeta({region:REGIONS[region]?.label||region,count:filteredIncidents.length,timestamp:new Date().toLocaleString(),mode:analysisMode});

    const payload=filteredIncidents.map(ev=>({id:ev.id,type:ev.type,severity:ev.severity,date:ev.date,aircraft:ev.aircraft,category:ev.category,reg:ev.reg,carrier:ev.carrier||"Independent",location:ev.location,phase:ev.phase,injuries:ev.injuries,fatalities:ev.fatalities,description:ev.description,source:ev.source}));
    const userMsg=`REGION: ${REGIONS[region]?.label}\nFILTERS: Aircraft=${aircraftCat}, Carrier=${carrier}\nDATE: ${dateFrom||"All"} to ${dateTo||"Present"}\nTOTAL: ${filteredIncidents.length} events\n\nEVENTS:\n${JSON.stringify(payload,null,2)}\n\nProduce your full analysis brief now.`;

    try{
      const res=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1800,system:ANALYSIS_PROMPTS[analysisMode],messages:[{role:"user",content:userMsg}]})});
      const data=await res.json();
      if(!res.ok) throw new Error(data?.error||`API ${res.status}`);
      const text=data?.content?.[0]?.text||"";
      setAnalysisText(text);
      setAnalysisStatus("done");
      sendNotif(
        `◈ Analysis Complete · ${analysisMode.toUpperCase()} BRIEF`,
        `${filteredIncidents.length} events · ${REGIONS[region]?.label||region} · Click to view`,
        `analysis_${Date.now()}`,
        "normal"
      );
    }catch(err){setAnalysisStatus("error");setAnalysisText(`Analysis failed: ${err.message}`);}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[filteredIncidents,region,analysisMode,aircraftCat,carrier,dateFrom,dateTo]);

  /* ── Stats & chat context ────────────────────────────────────────────── */
  const airborne=flights.filter(s=>!s[8]).length;
  const emergency=flights.filter(s=>EMERGENCY_SQUAWKS[s[14]]).length;

  const emgFlights=flights.filter(s=>EMERGENCY_SQUAWKS[s[14]]);

  const chatDashboardState={
    region,aircraftCat,carrier,dateFrom,dateTo,
    filteredCount:filteredIncidents.length,
    incidentTotal:incidents.length,
    flightCount:flights.length,airborne,emergency,
    emgCallsigns:emgFlights.slice(0,5).map(s=>s[1]?.trim()||s[0]).join(", "),
    weatherActive:delaysEnabled||turbulenceEnabled,
    weatherLayers:[delaysEnabled?"Airport Delays":"",turbulenceEnabled?"Turbulence":""].filter(Boolean).join(", "),
    dataSources:[asrsStatus==="ok"?"ASRS":null,sdrStatus==="ok"?"SDR":null,asiasStatus==="ok"?"ASIAS (10bd)":null].filter(Boolean),
    acarsActive:acarsStatus==="ok",
    acarsAlertCount:acarsAlerts.length,
    topEvents:filteredIncidents.slice(0,6).map(e=>`- ${e.date}: ${e.aircraft||"Unknown"} at ${e.location||"Unknown"} (${e.type}/${e.severity}, src:${e.source})`).join("\n"),
  };

  /* ════════════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:C.bg0,color:C.text,fontFamily:"'DM Sans',sans-serif",overflow:"hidden"}}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.4);opacity:0.6}}
        @keyframes scanline{0%{top:-2px}100%{top:100%}}
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:#0f2d4a;border-radius:2px;}
        select option{background:#0a1829;}
        .leaflet-popup-content-wrapper{background:transparent!important;border:none!important;box-shadow:none!important;padding:0!important;}
        .leaflet-popup-content{margin:0!important;}
        .av-popup .leaflet-popup-content-wrapper{background:#06101a!important;border:1px solid #0f2d4a!important;box-shadow:0 8px 32px rgba(0,0,0,.8)!important;border-radius:6px!important;}
        .av-popup .leaflet-popup-tip-container{display:none;}
        .av-popup .leaflet-popup-close-button{color:#3a6080!important;font-size:16px!important;top:6px!important;right:8px!important;}
        .leaflet-control-zoom a{background:#0a1829!important;border-color:#0f2d4a!important;color:#3a6080!important;}
        .leaflet-control-zoom a:hover{background:#0c1e33!important;color:#00b4ff!important;}
        .leaflet-control-attribution{background:#06101a88!important;color:#1a3a5c!important;font-size:9px!important;}
        .leaflet-control-attribution a{color:#2a5a8c!important;}
      `}</style>

      {/* ══ TOP BAR ═════════════════════════════════════════════════════════ */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",height:"50px",background:C.bg1,borderBottom:`1px solid ${C.border}`,flexShrink:0,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",left:0,right:0,height:"1px",background:`linear-gradient(90deg,transparent,${C.accent}44,transparent)`,animation:"scanline 4s linear infinite",pointerEvents:"none"}}/>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <div style={{fontSize:"24px",color:C.accent,filter:`drop-shadow(0 0 8px ${C.accent})`}}>✈</div>
          <div>
            <div style={{fontFamily:"'Orbitron',monospace",fontSize:"13px",fontWeight:"900",color:C.accent,letterSpacing:"0.12em",lineHeight:1}}>AVOSINT</div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:"9px",color:C.muted,letterSpacing:"0.2em"}}>AVIATION INTELLIGENCE PLATFORM</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center"}}>
          <StatPill label="AIRBORNE"  value={airborne}  color={C.safe}/>
          <StatPill label="EMERGENCY" value={emergency}  color={C.danger} blink/>
          <StatPill label="EVENTS" value={filteredIncidents.length} color="#ff5533"/>
          <StatPill label="INCIDENTS" value={incidents.length}  color={C.warn}/>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"8px"}}>

          {/* ── Notification bell ── */}
          <div style={{display:"flex",alignItems:"center",gap:"6px",
            background: notifEnabled?"#0a1f0a88": notifPermission==="denied"?"#1a000088":C.bg2,
            border:`1px solid ${notifEnabled?`${C.safe}55`:notifPermission==="denied"?`${C.danger}44`:C.border}`,
            borderRadius:"4px",padding:"4px 10px",cursor:notifPermission==="denied"?"not-allowed":"pointer",
            userSelect:"none",
          }} onClick={()=>{
            if(notifPermission==="denied") return;
            if(notifPermission==="granted"){ setNotifEnabled(v=>!v); return; }
            requestNotifPermission();
          }}
          title={notifPermission==="denied"?"Notifications blocked in browser settings — click the 🔒 icon in your address bar to allow":notifEnabled?"Notifications ON — click to disable":"Click to enable browser notifications"}>
            <span style={{fontSize:"13px",lineHeight:1,filter:notifEnabled?`drop-shadow(0 0 5px ${C.safe})`:"none"}}>
              {notifPermission==="denied"?"🔕":notifEnabled?"🔔":"🔕"}
            </span>
            <span style={{fontFamily:"'Orbitron',monospace",fontSize:"9px",letterSpacing:"0.1em",
              color:notifEnabled?C.safe:notifPermission==="denied"?C.danger:C.muted}}>
              {notifPermission==="denied"?"BLOCKED":notifEnabled?"ALERTS ON":"ALERTS OFF"}
            </span>
            {recentNotifs.length>0&&notifEnabled&&(
              <span style={{background:C.danger,color:"white",borderRadius:"8px",padding:"1px 5px",
                fontSize:"9px",fontWeight:"bold",fontFamily:"'Share Tech Mono',monospace",
                animation:"blink 1.4s step-end infinite"}}>
                {recentNotifs.length}
              </span>
            )}
          </div>
          {(delaysEnabled||turbulenceEnabled)&&(
            <div style={{display:"flex",alignItems:"center",gap:"6px",background:"#1a0f0088",border:`1px solid ${C.wx}44`,borderRadius:"4px",padding:"4px 10px"}}>
              {weatherLoading&&<span style={{width:"6px",height:"6px",borderRadius:"50%",background:C.wx,display:"inline-block",animation:"blink 0.6s step-end infinite"}}/>}
              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:"10px",color:C.wx}}>
                ⛅ WEATHER {delaysEnabled?"DELAYS":""}  {turbulenceEnabled?"TURB":""}
              </span>
            </div>
          )}
          <div style={{display:"flex",alignItems:"center",gap:"6px",background:apiStatus==="ok"?"#022d1088":apiStatus==="error"?"#2d000088":C.bg2,border:`1px solid ${apiStatus==="ok"?`${C.safe}44`:apiStatus==="error"?`${C.danger}44`:C.border}`,borderRadius:"4px",padding:"4px 10px"}}>
            <div style={{width:"6px",height:"6px",borderRadius:"50%",background:apiStatus==="ok"?C.safe:apiStatus==="error"?C.danger:apiStatus==="loading"?C.warn:C.muted,animation:apiStatus==="ok"?"pulse 2s ease-in-out infinite":apiStatus==="loading"?"blink 0.8s step-end infinite":"none"}}/>
            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:"10px",color:C.muted}}>
              {apiStatus==="ok"?`LIVE · ${lastUpdated?.toLocaleTimeString()}`:apiStatus==="error"?"FEED OFFLINE":apiStatus==="loading"?"POLLING…":"STANDBY"}
            </span>
          </div>
          <button onClick={fetchFlights} style={{...btn,color:C.accent,border:`1px solid ${C.accentD}44`,padding:"4px 12px"}}>⟳ REFRESH</button>
        </div>
      </div>

      {/* ══ BODY ════════════════════════════════════════════════════════════ */}
      <div style={{display:"flex",flex:1,overflow:"hidden",paddingBottom:chatOpen?"42vh":"38px",transition:"padding-bottom 0.3s cubic-bezier(0.4,0,0.2,1)"}}>

        {/* ── LEFT SIDEBAR ─────────────────────────────────────────────── */}
        <div style={{width:"230px",background:C.panel,borderRight:`1px solid ${C.border}`,overflow:"auto",flexShrink:0,padding:"14px 12px"}}>

          {/* ── Reset all filters ─────────────────────────────────────── */}
          <button onClick={()=>{
            setRegion("global");
            setEventTypes({accident:true,incident:true,military:true,vip:true,live:true,asrs:true,sdr:true,asias:true});
            setCarrier("All Carriers");
            setAircraftCat("All Types");
            setSquawkFilter([]);
            setOnGroundHide(false);
            setDateFrom("");
            setDateTo("");
            setSearchText("");
            fetchIncidents(); // reload with default date window
          }} style={{...btn,width:"100%",marginBottom:"10px",fontSize:"9px",fontFamily:"'Orbitron',monospace",color:C.accent,border:`1px solid ${C.accent}44`,letterSpacing:"0.08em"}}>
            ↺ RESET ALL FILTERS
          </button>

          <FilterSection title="REGION">
            <select value={region} onChange={e=>setRegion(e.target.value)} style={sel}>
              {Object.entries(REGIONS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </FilterSection>

          <FilterSection title="EVENT TYPES">
            {[["live","✈","Live Flights",C.safe],["accident","💥","Accidents",C.danger],["incident","⚠️","Incidents",C.warn],["military","✦","Military",C.mil],["vip","★","VIP / Gov",C.vip]].map(([k,icon,label,color])=>(
              <label key={k} style={{display:"flex",alignItems:"center",gap:"7px",cursor:"pointer",padding:"3px 0",fontSize:"11px"}}>
                <input type="checkbox" checked={eventTypes[k]} onChange={e=>setEventTypes(p=>({...p,[k]:e.target.checked}))} style={{accentColor:color,width:"12px",height:"12px"}}/>
                <span style={{color}}>{icon}</span>
                <span style={{color:C.text}}>{label}</span>
              </label>
            ))}
          </FilterSection>

          <FilterSection title="DATA SOURCES">
            <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
              {[
                ["asrs", "📋","ASRS Reports",  "#00b4ff", asrsStatus ],
                ["sdr",  "🔧","FAA SDR",       "#ffb300", sdrStatus  ],
                ["asias","🚨","FAA ASIAS",      "#ff6644", asiasStatus],
              ].map(([k,icon,label,color,status])=>(
                <div key={k}>
                  <label style={{display:"flex",alignItems:"center",gap:"7px",cursor:"pointer",padding:"3px 0",fontSize:"11px"}}>
                    <input type="checkbox" checked={eventTypes[k]} onChange={e=>setEventTypes(p=>({...p,[k]:e.target.checked}))} style={{accentColor:color,width:"12px",height:"12px"}}/>
                    <span>{icon}</span>
                    <span style={{color:C.text,flex:1}}>{label}</span>
                    <span style={{fontSize:"8px",color:status==="ok"?C.safe:status==="error"?C.danger:status==="loading"?C.warn:C.muted,fontFamily:"'Share Tech Mono',monospace"}}>{status==="ok"?"LIVE":status==="error"?"ERR":status==="loading"?"…":"—"}</span>
                  </label>
                  {k==="asias"&&(
                    <div style={{marginLeft:"19px",marginBottom:"2px",padding:"3px 6px",background:"#1a0800",border:"1px solid #ff664433",borderRadius:"3px",fontSize:"9px",color:"#ff9966",fontFamily:"'Share Tech Mono',monospace",lineHeight:1.4}}>
                      ⏱ 10 business-day window only.<br/>
                      FAA constraint — no historical data.
                    </div>
                  )}
                </div>
              ))}
              {incidentsUpdated&&<div style={{fontSize:"9px",color:C.muted,fontFamily:"'Share Tech Mono',monospace",marginTop:"2px"}}>Updated: {incidentsUpdated.toLocaleTimeString()}</div>}
              <button onClick={()=>fetchIncidents()} disabled={incidentsStatus==="loading"} style={{...btn,marginTop:"3px",width:"100%",fontSize:"9px",fontFamily:"'Orbitron',monospace",color:incidentsStatus==="loading"?C.muted:C.accent,border:`1px solid ${C.accent}33`}}>
                {incidentsStatus==="loading"?"LOADING…":"⟳ REFRESH EVENTS"}
              </button>
            </div>
          </FilterSection>

          <FilterSection title="AIRCRAFT CATEGORY">
            <select value={aircraftCat} onChange={e=>setAircraftCat(e.target.value)} style={sel}>
              {AIRCRAFT_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </FilterSection>

          <FilterSection title="AIR CARRIER">
            <select value={carrier} onChange={e=>setCarrier(e.target.value)} style={sel}>
              {CARRIERS.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </FilterSection>

          <FilterSection title="SQUAWK CODES">
            {[{code:"7700",label:"7700 — Emergency",color:"#ff4444"},{code:"7600",label:"7600 — Radio Fail",color:"#ff9900"},{code:"7500",label:"7500 — Hijack",color:"#cc0000"}].map(sq=>(
              <label key={sq.code} style={{display:"flex",alignItems:"center",gap:"7px",cursor:"pointer",padding:"3px 0",fontSize:"11px"}}>
                <input type="checkbox" checked={squawkFilter.includes(sq.code)} onChange={e=>setSquawkFilter(p=>e.target.checked?[...p,sq.code]:p.filter(c=>c!==sq.code))} style={{accentColor:sq.color}}/>
                <span style={{color:sq.color,fontFamily:"'Share Tech Mono',monospace"}}>{sq.label}</span>
              </label>
            ))}
            {squawkFilter.length>0&&<button onClick={()=>setSquawkFilter([])} style={{...btn,marginTop:"5px",width:"100%",fontSize:"9px",letterSpacing:"0.08em",fontFamily:"'Orbitron',monospace"}}>CLEAR FILTER</button>}
          </FilterSection>

          <FilterSection title="FLIGHT STATUS">
            <Toggle on={onGroundHide} onToggle={()=>setOnGroundHide(v=>!v)} label="Hide ground traffic"/>
          </FilterSection>

          <FilterSection title="DATE RANGE">
            <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
              <div style={{fontSize:"9px",color:C.muted,letterSpacing:"0.08em"}}>FROM</div>
              <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={inp}/>
              <div style={{fontSize:"9px",color:C.muted,letterSpacing:"0.08em",marginTop:"2px"}}>TO</div>
              <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={inp}/>
              {/* ASIAS window warning — show whenever a date is set */}
              {(dateFrom||dateTo)&&(
                <div style={{padding:"5px 7px",background:"#1a0800",border:"1px solid #ff664433",borderRadius:"3px",fontSize:"9px",color:"#ff9966",fontFamily:"'Share Tech Mono',monospace",lineHeight:1.5}}>
                  ⏱ <strong style={{color:"#ffaa77"}}>ASIAS data:</strong> always last 10 business days only — date range does not apply to ASIAS.<br/>
                  ASRS + SDR will search the selected range.
                </div>
              )}
              <div style={{display:"flex",gap:"5px",marginTop:"2px"}}>
                <button onClick={()=>fetchIncidents(dateFrom,dateTo)} style={{...btn,flex:1,fontSize:"8px",fontFamily:"'Orbitron',monospace",color:C.accent,border:`1px solid ${C.accent}44`}}>🔍 SEARCH</button>
                {(dateFrom||dateTo)&&<button onClick={()=>{setDateFrom("");setDateTo("");fetchIncidents();}} style={{...btn,fontSize:"8px",fontFamily:"'Orbitron',monospace"}}>✕ CLEAR</button>}
              </div>
            </div>
          </FilterSection>

          <FilterSection title="SEARCH">
            <input type="text" placeholder="callsign, aircraft, location…" value={searchText} onChange={e=>setSearchText(e.target.value)} style={inp}/>
          </FilterSection>

          {/* ── WEATHER LAYERS ────────────────────────────────────────── */}
          <FilterSection title="WEATHER LAYERS">
            <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
              <Toggle on={delaysEnabled} onToggle={()=>{setDelaysEnabled(v=>!v);if(!weatherData)fetchWeather();}} label="Airport Delays (FAA)" color={C.wxDelay}/>
              <Toggle on={turbulenceEnabled} onToggle={()=>{setTurbulenceEnabled(v=>!v);if(!weatherData)fetchWeather();}} label="Turbulence (SIGMET/AIRMET)" color={C.wxTurb}/>
              {(delaysEnabled||turbulenceEnabled)&&(
                <button onClick={fetchWeather} disabled={weatherLoading} style={{...btn,width:"100%",fontSize:"9px",fontFamily:"'Orbitron',monospace",color:weatherLoading?C.muted:C.wx,border:`1px solid ${C.wx}33`}}>
                  {weatherLoading?"UPDATING…":"⟳ REFRESH WEATHER"}
                </button>
              )}
              {weatherData&&(
                <div style={{fontSize:"9px",color:C.muted,fontFamily:"'Share Tech Mono',monospace",lineHeight:1.5}}>
                  {weatherData.delays?.length>0&&<div style={{color:C.wxDelay}}>⚠ {weatherData.delays.length} delay notice{weatherData.delays.length>1?"s":""}</div>}
                  {weatherData.airmets?.features?.length>0&&<div style={{color:C.wxTurb}}>⚡ {weatherData.airmets.features.length} turbulence AIRMET{weatherData.airmets.features.length>1?"s":""}</div>}
                  {weatherData.sigmets?.features?.length>0&&<div style={{color:"#ff4444"}}>🔴 {weatherData.sigmets.features.length} SIGMET{weatherData.sigmets.features.length>1?"s":""}</div>}
                  <div style={{marginTop:"3px",opacity:0.6}}>Updated: {weatherData.ts?new Date(weatherData.ts).toLocaleTimeString():"—"}</div>
                </div>
              )}
            </div>
          </FilterSection>

          {/* Data sources legend */}
          <div style={{marginTop:"8px",padding:"10px",background:C.bg0,border:`1px solid ${C.border}`,borderRadius:"4px"}}>
            <div style={{fontSize:"8px",fontFamily:"'Orbitron',monospace",color:C.muted,letterSpacing:"0.12em",marginBottom:"7px"}}>ACTIVE FEEDS</div>
            {[{dot:C.safe,label:"OpenSky Network (ADS-B)"},{dot:"#00b4ff",label:"NASA ASRS Reports"},{dot:"#ffb300",label:"FAA Service Difficulty Reports"},{dot:"#ff6644",label:"FAA ASIAS Preliminary (10bd)"},{dot:"#00e5ff",label:"airframes.io ACARS"},{dot:C.wxDelay,label:"FAA NASSTATUS (delays)"},{dot:C.wxTurb,label:"NOAA SIGMET/AIRMET"}].map((s,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:"6px",fontSize:"10px",color:C.muted,marginBottom:"3px"}}>
                <div style={{width:"5px",height:"5px",borderRadius:"50%",background:s.dot,flexShrink:0}}/>{s.label}
              </div>
            ))}
            <div style={{fontSize:"9px",color:C.muted,marginTop:"8px",lineHeight:1.4,borderTop:`1px solid ${C.border}`,paddingTop:"7px"}}>
              Incident data is a representative sample. Connect NTSB database for live records.
            </div>
          </div>
        </div>

        {/* ── MAP ──────────────────────────────────────────────────────── */}
        <div style={{flex:1,position:"relative",overflow:"hidden"}}>
          <div ref={mapDivRef} style={{width:"100%",height:"100%"}}/>

          {/* Legend */}
          <div style={{position:"absolute",bottom:"30px",left:"12px",zIndex:1000,background:"#020b14cc",backdropFilter:"blur(10px)",border:`1px solid ${C.border}`,borderRadius:"6px",padding:"10px 13px",fontSize:"10px",maxWidth:"220px"}}>
            <div style={{fontFamily:"'Orbitron',monospace",fontSize:"8px",letterSpacing:"0.12em",color:C.muted,marginBottom:"7px"}}>LEGEND</div>
            {[
              {icon:"✈",color:C.safe,    label:"Live Flight"},
              {icon:"✈",color:"#ff4444", label:"Squawk 7700 — Emergency"},
              {icon:"✈",color:"#ff9900", label:"Squawk 7600 — Radio Fail"},
              {icon:"✈",color:"#cc0000", label:"Squawk 7500 — Hijack"},
              {icon:"●",color:C.danger,  label:"Accident"},
              {icon:"●",color:C.warn,    label:"Incident"},
              {icon:"●",color:C.mil,     label:"Military"},
              {icon:"●",color:C.vip,     label:"VIP / Gov"},
            ].map((l,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:"7px",marginBottom:"3px"}}>
                <span style={{color:l.color,fontSize:l.icon==="●"?"8px":"11px",lineHeight:1}}>{l.icon}</span>
                <span style={{color:C.muted}}>{l.label}</span>
              </div>
            ))}
            {(delaysEnabled||turbulenceEnabled)&&<div style={{borderTop:`1px solid ${C.border}`,marginTop:"6px",paddingTop:"6px"}}>
              {delaysEnabled&&<div style={{display:"flex",gap:"7px",marginBottom:"3px",alignItems:"center"}}><span style={{fontSize:"8px",color:C.wxDelay}}>●</span><span style={{color:C.muted}}>Airport Delay</span></div>}
              {delaysEnabled&&<div style={{display:"flex",gap:"7px",marginBottom:"3px",alignItems:"center"}}><span style={{fontSize:"8px",color:C.danger}}>●</span><span style={{color:C.muted}}>Ground Stop</span></div>}
              {turbulenceEnabled&&<div style={{display:"flex",gap:"7px",alignItems:"center"}}><span style={{fontSize:"8px",color:C.wxTurb}}>▭</span><span style={{color:C.muted}}>Turbulence Zone</span></div>}
            </div>}
          </div>

          {/* Flight count badge */}
          {flights.length>0&&(
            <div style={{position:"absolute",top:"12px",left:"12px",zIndex:1000,background:"#020b14cc",border:`1px solid ${C.border}`,borderRadius:"4px",padding:"5px 10px",fontFamily:"'Share Tech Mono',monospace",fontSize:"11px",color:C.muted}}>
              <span style={{color:C.safe}}>{filteredFlights.length.toLocaleString()}</span> aircraft of <span style={{color:C.text}}>{flights.length.toLocaleString()}</span> tracked
            </div>
          )}

          {/* Loading */}
          {apiStatus==="loading"&&flights.length===0&&(
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"#020b14cc",zIndex:999}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:"40px",color:C.accent,animation:"blink 1s step-end infinite",marginBottom:"14px",filter:`drop-shadow(0 0 12px ${C.accent})`}}>✈</div>
                <div style={{fontFamily:"'Orbitron',monospace",fontSize:"11px",color:C.muted,letterSpacing:"0.15em"}}>ACQUIRING FEED…</div>
              </div>
            </div>
          )}

          {apiStatus==="error"&&(
            <div style={{position:"absolute",top:"12px",left:"50%",transform:"translateX(-50%)",background:"#1a000088",backdropFilter:"blur(8px)",border:`1px solid ${C.danger}66`,borderRadius:"4px",padding:"7px 16px",fontFamily:"'Share Tech Mono',monospace",fontSize:"11px",color:"#ff9999",zIndex:1000,whiteSpace:"nowrap"}}>
              ⚠ OpenSky Network unavailable — incident & weather layers still active
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL ──────────────────────────────────────────────── */}
        <div style={{width:"330px",background:C.panel,borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column",flexShrink:0}}>

          {/* Tabs */}
          <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
            {[["events","EVENTS",C.accent],["flights","FLIGHTS",C.accent],["acars","ACARS","#00e5ff"],["analysis","ANALYSIS","#cc88ff"],["post","POST","#ff8c00"],["alerts","🔔","#22dd77"]].map(([id,label,color])=>(
              <button key={id} onClick={()=>setActiveTab(id)} style={{flex:1,padding:"11px 0",cursor:"pointer",border:"none",background:activeTab===id?C.bg2:"transparent",color:activeTab===id?color:C.muted,fontFamily:"'Orbitron',monospace",fontSize:"7.5px",letterSpacing:"0.08em",borderBottom:activeTab===id?`2px solid ${color}`:"2px solid transparent",transition:"all 0.15s",position:"relative"}}>
                {label}
                {id==="analysis"&&analysisStatus==="loading"&&<span style={{position:"absolute",top:"3px",right:"3px",width:"6px",height:"6px",borderRadius:"50%",background:"#cc88ff",animation:"blink 0.6s step-end infinite"}}/>}
                {id==="acars"&&acarsAlerts.length>0&&<span style={{position:"absolute",top:"3px",right:"3px",width:"6px",height:"6px",borderRadius:"50%",background:"#00e5ff",animation:"blink 1s step-end infinite"}}/>}
                {id==="alerts"&&recentNotifs.length>0&&<span style={{position:"absolute",top:"3px",right:"3px",width:"6px",height:"6px",borderRadius:"50%",background:C.danger,animation:"blink 1.4s step-end infinite"}}/>}
              </button>
            ))}
          </div>

          {/* Panel header */}
          {(activeTab==="events"||activeTab==="flights"||activeTab==="acars")&&(
            <div style={{padding:"9px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:"10px",color:C.muted}}>
                {activeTab==="events"?`${filteredIncidents.length} events · ASRS + SDR + ASIAS`:activeTab==="acars"?`${acarsMessages.length} messages · ${acarsAlerts.length} flagged by AI`:`${filteredFlights.filter(s=>!s[8]).length} airborne · ${emgFlights.length} emergency`}
              </div>
            </div>
          )}

          {/* Emergency strip */}
          {emgFlights.length>0&&(activeTab==="events"||activeTab==="flights"||activeTab==="acars")&&(
            <div style={{background:"#1a000088",borderBottom:`1px solid ${C.danger}44`,padding:"8px 12px",flexShrink:0}}>
              <div style={{fontFamily:"'Orbitron',monospace",fontSize:"9px",color:C.danger,letterSpacing:"0.12em",marginBottom:"6px",animation:"blink 1.4s step-end infinite"}}>
                ⚠ {emgFlights.length} ACTIVE EMERGENCY SQUAWK{emgFlights.length>1?"S":""}
              </div>
              {emgFlights.slice(0,3).map((s,i)=>{
                const ec=SQUAWK_COLORS[s[14]]||C.danger;
                return (
                  <div key={i} style={{background:`${ec}11`,border:`1px solid ${ec}44`,borderRadius:"4px",padding:"7px 9px",marginBottom:"4px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{color:ec,fontFamily:"'Share Tech Mono',monospace",fontSize:"12px",fontWeight:"bold"}}>{s[1]?.trim()||s[0]?.toUpperCase()||"UNKNOWN"}</span>
                      <span style={{background:ec,color:"white",borderRadius:"3px",padding:"1px 6px",fontSize:"9px",fontFamily:"'Orbitron',monospace"}}>{s[14]}</span>
                    </div>
                    <div style={{fontSize:"10px",color:C.muted,marginTop:"2px",fontFamily:"'Share Tech Mono',monospace"}}>{s[2]} · {s[7]?Math.round(s[7]*3.281).toLocaleString()+" ft":"GND"}</div>
                    <div style={{fontSize:"9px",color:ec,marginTop:"1px"}}>{EMERGENCY_SQUAWKS[s[14]]}</div>
                  </div>
                );
              })}
              {emgFlights.length>3&&<div style={{fontSize:"9px",color:C.muted,textAlign:"center",marginTop:"2px"}}>+{emgFlights.length-3} more</div>}
            </div>
          )}

          {/* Scrollable content */}
          <div style={{flex:1,overflow:"auto"}}>

            {/* EVENTS */}
            {activeTab==="events"&&(
              incidentsStatus==="loading"&&incidents.length===0
                ?<div style={{padding:"32px",textAlign:"center",color:C.muted,fontFamily:"'Share Tech Mono',monospace",fontSize:"11px",lineHeight:2}}>
                    <div style={{animation:"blink 0.8s step-end infinite",fontSize:"18px",marginBottom:"8px"}}>📡</div>
                    LOADING ASRS + SDR + ASIAS DATA…
                  </div>
                // Only show error block when NO events at all — partial source failures still show what loaded
                :incidentsStatus==="error"&&incidents.length===0
                  ?<div style={{padding:"24px",textAlign:"center",fontFamily:"'Share Tech Mono',monospace",fontSize:"11px",lineHeight:1.8}}>
                      <div style={{color:C.danger,marginBottom:"8px"}}>⚠ DATA FEED ERROR</div>
                      <div style={{color:C.muted,fontSize:"10px"}}>All event sources unavailable.<br/>Check API proxy logs in Vercel.</div>
                      <button onClick={()=>fetchIncidents()} style={{...btn,marginTop:"10px",fontSize:"9px"}}>⟳ RETRY</button>
                    </div>
                  :filteredIncidents.length===0
                    ?<div style={{padding:"32px",textAlign:"center",color:C.muted,fontFamily:"'Share Tech Mono',monospace",fontSize:"11px"}}>
                        {incidents.length===0?"NO EVENTS LOADED":"NO EVENTS MATCH FILTERS"}
                      </div>
                    :[...filteredIncidents]
                        .sort((a,b)=>(b.date||"").localeCompare(a.date||""))
                        .map(ev=>(
                          <EventCard key={ev.id} ev={ev} selected={selectedEvent?.id===ev.id} onClick={()=>setSelectedEvent(ev)} onGeneratePost={generatePost} generating={generatingEventId===ev.id}/>
                        ))
            )}

            {/* FLIGHTS */}
            {activeTab==="flights"&&(
              filteredFlights.length===0
                ?<div style={{padding:"32px",textAlign:"center",color:C.muted,fontFamily:"'Share Tech Mono',monospace",fontSize:"11px"}}>{apiStatus==="error"?"FEED OFFLINE":flights.length===0?"LOADING…":"NO FLIGHTS MATCH FILTERS"}</div>
                :filteredFlights.slice(0,200).map((s,i)=>{
                  const[icao24,callsign,country,,,,,balt,onGround,vel,,,,, squawk]=s;
                  const isEmg=EMERGENCY_SQUAWKS[squawk];
                  const ec=SQUAWK_COLORS[squawk];
                  const altFt=balt?Math.round(balt*3.281):null;
                  const spdKts=vel?Math.round(vel*1.944):null;
                  return (
                    <div key={i} style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,borderLeft:isEmg?`3px solid ${ec}`:"3px solid transparent",background:isEmg?`${ec}09`:"transparent",fontSize:"11px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontFamily:"'Share Tech Mono',monospace",color:isEmg?ec:C.text,fontWeight:"bold"}}>{callsign?.trim()||icao24?.toUpperCase()||"UNKNOWN"}</span>
                        {isEmg&&<span style={{fontSize:"8px",background:ec,color:"white",borderRadius:"3px",padding:"1px 5px",fontFamily:"'Orbitron',monospace"}}>{squawk}</span>}
                        {!isEmg&&squawk&&<span style={{fontSize:"9px",color:C.muted,fontFamily:"'Share Tech Mono',monospace"}}>{squawk}</span>}
                      </div>
                      <div style={{color:C.muted,fontSize:"10px",fontFamily:"'Share Tech Mono',monospace",marginTop:"2px"}}>
                        {country} · {altFt!=null?` FL${Math.round(altFt/100).toString().padStart(3,"0")}`:' GND'} · {spdKts!=null?` ${spdKts}kts`:""} · <span style={{color:onGround?C.warn:C.safe}}>{onGround?"GND":"AIR"}</span>
                      </div>
                    </div>
                  );
                })
            )}

            {/* ANALYSIS */}
            {/* ACARS TAB */}
            {activeTab==="acars"&&(
              <div style={{padding:"12px",display:"flex",flexDirection:"column",gap:"10px"}}>

                {/* ACARS status bar */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",background:C.bg0,border:`1px solid ${C.border}`,borderRadius:"4px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"7px",fontSize:"10px",fontFamily:"'Share Tech Mono',monospace"}}>
                    <div style={{width:"6px",height:"6px",borderRadius:"50%",background:acarsStatus==="ok"?"#00e5ff":acarsStatus==="error"?C.danger:acarsStatus==="loading"?C.warn:"#3a6080",animation:acarsStatus==="ok"?"pulse 2s ease-in-out infinite":acarsStatus==="loading"?"blink 0.8s step-end infinite":"none"}}/>
                    {acarsStatus==="nokey"&&<span style={{color:C.warn}}>API KEY NOT SET</span>}
                    {acarsStatus==="ok"&&<span style={{color:"#00e5ff"}}>{acarsMessages.length} MESSAGES · {acarsUpdated?.toLocaleTimeString()}</span>}
                    {acarsStatus==="loading"&&<span style={{color:C.muted}}>FETCHING…</span>}
                    {acarsStatus==="error"&&<span style={{color:C.danger}}>FEED ERROR</span>}
                    {acarsStatus==="idle"&&<span style={{color:C.muted}}>STANDBY</span>}
                  </div>
                  <div style={{display:"flex",gap:"5px"}}>
                    {acarsAiRunning&&<span style={{fontSize:"9px",color:"#00e5ff",fontFamily:"'Orbitron',monospace",animation:"blink 0.6s step-end infinite"}}>AI SCAN…</span>}
                    <button onClick={fetchAcars} style={{...btn,fontSize:"9px",padding:"2px 8px",fontFamily:"'Orbitron',monospace",color:"#00e5ff",border:"1px solid #00e5ff33"}}>⟳</button>
                  </div>
                </div>

                {/* No API key notice */}
                {acarsStatus==="nokey"&&(
                  <div style={{padding:"16px",background:C.bg0,border:`1px solid ${C.warn}44`,borderRadius:"6px",fontFamily:"'Share Tech Mono',monospace",fontSize:"11px",lineHeight:1.8,color:C.muted}}>
                    <div style={{color:C.warn,fontWeight:"bold",marginBottom:"8px"}}>📡 ACARS SETUP REQUIRED</div>
                    <div>ACARS data is provided by <span style={{color:C.accent}}>airframes.io</span></div>
                    <div style={{marginTop:"6px"}}>1. Register free at <span style={{color:C.accent}}>airframes.io</span></div>
                    <div>2. Copy your API key</div>
                    <div>3. Add to Vercel: <span style={{color:"#00e5ff"}}>AIRFRAMES_API_KEY</span></div>
                    <div>4. Redeploy — ACARS will activate automatically</div>
                  </div>
                )}

                {/* AI alerts */}
                {acarsAlerts.length>0&&(
                  <div style={{background:"#00001a",border:"1px solid #00e5ff44",borderRadius:"6px",overflow:"hidden"}}>
                    <div style={{padding:"7px 10px",background:"#00e5ff11",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontFamily:"'Orbitron',monospace",fontSize:"9px",color:"#00e5ff",letterSpacing:"0.1em"}}>AI FLAGGED · {acarsAlerts.length}</span>
                      <button onClick={()=>setAcarsAlerts([])} style={{...btn,fontSize:"8px",padding:"1px 7px",color:C.muted}}>CLEAR</button>
                    </div>
                    {acarsAlerts.map((a,i)=>(
                      <div key={i} style={{padding:"9px 10px",borderBottom:`1px solid #00e5ff22`,borderLeft:`3px solid ${a.severity==="high"?C.danger:a.severity==="medium"?C.warn:"#00e5ff"}`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"3px"}}>
                          <span style={{fontFamily:"'Orbitron',monospace",fontSize:"10px",color:"#00e5ff"}}>{a.callsign}</span>
                          <span style={{fontSize:"8px",background:a.severity==="high"?`${C.danger}22`:a.severity==="medium"?`${C.warn}22`:"#00e5ff22",color:a.severity==="high"?C.danger:a.severity==="medium"?C.warn:"#00e5ff",padding:"1px 6px",borderRadius:"3px",fontFamily:"'Orbitron',monospace"}}>{a.severity?.toUpperCase()}</span>
                        </div>
                        <div style={{fontSize:"11px",color:C.text,fontFamily:"'Share Tech Mono',monospace",lineHeight:1.5}}>{a.summary}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Message feed */}
                {acarsMessages.length===0&&acarsStatus!=="nokey"&&(
                  <div style={{padding:"24px",textAlign:"center",color:C.muted,fontFamily:"'Share Tech Mono',monospace",fontSize:"11px"}}>
                    {acarsStatus==="loading"?"FETCHING MESSAGES…":"NO MESSAGES — CHECK API KEY OR RETRY"}
                  </div>
                )}
                {acarsMessages.map((m,i)=>{
                  const isAlerted=acarsAlerts.some(a=>a.callsign===m.callsign);
                  return (
                    <div key={m.id||i} style={{padding:"8px 10px",background:isAlerted?"#00e5ff08":C.bg0,border:`1px solid ${isAlerted?"#00e5ff33":C.border}`,borderRadius:"4px",borderLeft:`3px solid ${isAlerted?"#00e5ff":C.border}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"3px"}}>
                        <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                          <span style={{fontFamily:"'Orbitron',monospace",fontSize:"10px",color:"#00e5ff",fontWeight:"bold"}}>{m.callsign}</span>
                          {m.label&&<span style={{fontSize:"8px",background:"#00e5ff18",color:"#00e5ff",padding:"1px 5px",borderRadius:"3px",fontFamily:"'Share Tech Mono',monospace"}}>LBL:{m.label}</span>}
                          {m.freq&&<span style={{fontSize:"9px",color:C.muted,fontFamily:"'Share Tech Mono',monospace"}}>{m.freq}</span>}
                        </div>
                        <span style={{fontSize:"9px",color:C.muted,fontFamily:"'Share Tech Mono',monospace"}}>{new Date(m.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div style={{fontSize:"11px",color:C.text,fontFamily:"'Share Tech Mono',monospace",lineHeight:1.5,wordBreak:"break-all"}}>{m.text.slice(0,200)}</div>
                      {m.reg&&<div style={{fontSize:"9px",color:C.muted,marginTop:"2px",fontFamily:"'Share Tech Mono',monospace"}}>REG: {m.reg} · VIA: {m.station||"unknown"}</div>}
                    </div>
                  );
                })}

              </div>
            )}

            {activeTab==="analysis"&&(
              <div style={{padding:"14px 12px",height:"100%",display:"flex",flexDirection:"column",gap:"10px"}}>
                <div>
                  <div style={{fontSize:"8px",fontFamily:"'Orbitron',monospace",color:C.muted,letterSpacing:"0.12em",marginBottom:"6px"}}>ANALYSIS MODE</div>
                  <div style={{display:"flex",gap:"5px"}}>
                    {[["safety","🛡 Safety","#22dd77"],["patterns","📊 Patterns","#00b4ff"],["threat","⚠ Threat","#ff5533"]].map(([id,label,color])=>(
                      <button key={id} onClick={()=>setAnalysisMode(id)} style={{flex:1,padding:"6px 4px",cursor:"pointer",border:`1px solid ${analysisMode===id?color:C.border}`,background:analysisMode===id?`${color}18`:C.bg0,color:analysisMode===id?color:C.muted,fontFamily:"'Share Tech Mono',monospace",fontSize:"9px",borderRadius:"4px",transition:"all 0.15s"}}>{label}</button>
                    ))}
                  </div>
                </div>
                <div style={{background:C.bg0,border:`1px solid ${C.border}`,borderRadius:"4px",padding:"9px 10px"}}>
                  <div style={{fontSize:"8px",fontFamily:"'Orbitron',monospace",color:C.muted,letterSpacing:"0.1em",marginBottom:"5px"}}>SCOPE</div>
                  <div style={{fontSize:"10px",color:C.text,fontFamily:"'Share Tech Mono',monospace",lineHeight:1.6}}>
                    <span style={{color:"#cc88ff"}}>{filteredIncidents.length}</span> events · {REGIONS[region]?.label||region}<br/>
                    {dateFrom||dateTo?`${dateFrom||"all"} → ${dateTo||"present"}`:"All dates"}<br/>
                    {aircraftCat!=="All Types"&&<><span style={{color:C.muted}}>Aircraft: </span>{aircraftCat}<br/></>}
                    {carrier!=="All Carriers"&&<><span style={{color:C.muted}}>Carrier: </span>{carrier}</>}
                  </div>
                </div>
                <button onClick={runAnalysis} disabled={analysisStatus==="loading"||filteredIncidents.length===0}
                  style={{width:"100%",padding:"10px",cursor:analysisStatus==="loading"||filteredIncidents.length===0?"not-allowed":"pointer",background:analysisStatus==="loading"?"#1a0a2e":filteredIncidents.length===0?C.bg0:"linear-gradient(135deg,#1a0a2e,#0d1f3c)",border:`1px solid ${analysisStatus==="loading"?"#cc88ff66":filteredIncidents.length===0?C.border:"#cc88ff88"}`,color:filteredIncidents.length===0?C.muted:"#cc88ff",fontFamily:"'Orbitron',monospace",fontSize:"10px",letterSpacing:"0.12em",borderRadius:"4px",display:"flex",alignItems:"center",justifyContent:"center",gap:"7px"}}>
                  {analysisStatus==="loading"?<><span style={{animation:"blink 0.6s step-end infinite"}}>◈</span>ANALYZING…</>:<>◈ RUN AI ANALYSIS</>}
                </button>
                {filteredIncidents.length===0&&<div style={{fontSize:"10px",color:C.muted,textAlign:"center",fontFamily:"'Share Tech Mono',monospace"}}>Apply filters to select events first</div>}
                {(analysisText||analysisStatus==="loading")&&(
                  <div style={{flex:1,overflow:"auto",background:C.bg0,border:`1px solid #cc88ff33`,borderRadius:"4px"}}>
                    {analysisMeta&&<div style={{padding:"8px 12px",borderBottom:`1px solid #cc88ff22`,background:"#0d0218",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{fontFamily:"'Orbitron',monospace",fontSize:"8px",color:"#cc88ff",letterSpacing:"0.1em"}}>{analysisMeta.mode.toUpperCase()} BRIEF</div>
                      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:"8px",color:C.muted}}>{analysisMeta.count} EVT · {analysisMeta.timestamp}</div>
                    </div>}
                    <div style={{padding:"12px",fontSize:"11px",lineHeight:"1.75",color:C.text,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
                      {analysisText}
                      {analysisStatus==="loading"&&<span style={{display:"inline-block",width:"8px",height:"12px",background:"#cc88ff",marginLeft:"2px",animation:"blink 0.7s step-end infinite",verticalAlign:"text-bottom"}}/>}
                    </div>
                    {analysisStatus==="done"&&<div style={{padding:"8px 12px",borderTop:`1px solid #cc88ff22`,background:"#0d0218",display:"flex",justifyContent:"space-between"}}>
                      <div style={{fontSize:"8px",color:C.safe,fontFamily:"'Orbitron',monospace",letterSpacing:"0.1em"}}>✓ ANALYSIS COMPLETE</div>
                      <button onClick={()=>{setAnalysisText("");setAnalysisStatus("idle");}} style={{...btn,fontSize:"8px",padding:"3px 8px",fontFamily:"'Orbitron',monospace"}}>CLEAR</button>
                    </div>}
                    {analysisStatus==="error"&&<div style={{padding:"8px 12px",borderTop:`1px solid ${C.danger}22`,background:"#1a000a"}}><div style={{fontSize:"9px",color:C.danger,fontFamily:"'Share Tech Mono',monospace"}}>{analysisText}</div></div>}
                  </div>
                )}
              </div>
            )}

            {/* POST */}
            {activeTab==="post"&&(
              <div style={{padding:"14px 12px",display:"flex",flexDirection:"column",gap:"10px"}}>
                <div style={{background:C.bg0,border:`1px solid #ff8c0033`,borderRadius:"6px",padding:"14px"}}>
                  <div style={{fontFamily:"'Orbitron',monospace",fontSize:"9px",color:"#ff8c00",letterSpacing:"0.12em",marginBottom:"8px"}}>📷 POST GENERATOR</div>
                  <div style={{fontSize:"11px",color:C.text,lineHeight:"1.65"}}>
                    Click the <span style={{color:"#cc88ff",fontFamily:"'Share Tech Mono',monospace"}}>📷</span> button on any event in the Events tab, or click <strong style={{color:"#cc88ff"}}>📷 GENERATE POST</strong> in the event detail panel.
                  </div>
                  <div style={{marginTop:"10px",fontSize:"11px",color:C.muted,lineHeight:"1.65"}}>
                    AVOSINT will automatically:
                  </div>
                  <div style={{marginTop:"6px",display:"flex",flexDirection:"column",gap:"6px"}}>
                    {["Render a 1080×1080 branded image card","Write an AI-optimized caption + hashtags","Let you edit the caption before posting","Provide one-click download (PNG) + copy"].map((s,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"flex-start",gap:"8px",fontSize:"11px",color:C.muted}}>
                        <span style={{color:"#ff8c00",flexShrink:0}}>▸</span>{s}
                      </div>
                    ))}
                  </div>
                  <div style={{marginTop:"12px",padding:"10px",background:C.bg1,border:`1px solid ${C.border}`,borderRadius:"4px",fontSize:"10px",color:C.muted,lineHeight:1.5}}>
                    📱 Works with any platform: copy the caption and save the image, then post manually to Instagram, X/Twitter, LinkedIn, or any other platform of your choice. No API keys or paid subscriptions required.
                  </div>
                </div>
                <div style={{background:C.bg0,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"12px"}}>
                  <div style={{fontFamily:"'Orbitron',monospace",fontSize:"8px",color:C.muted,letterSpacing:"0.12em",marginBottom:"8px"}}>QUICK ACTIONS</div>
                  <div style={{fontSize:"11px",color:C.muted,marginBottom:"10px",fontFamily:"'Share Tech Mono',monospace"}}>
                    {filteredIncidents.length} events available · click any to generate
                  </div>
                  {filteredIncidents.slice(0,5).map(ev=>{
                    const sev=SEVERITY_META[ev.severity]||SEVERITY_META.medium;
                    return (
                      <div key={ev.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
                        <div style={{fontSize:"10px",color:C.text}}>{ev.aircraft.slice(0,18)} · <span style={{color:C.muted}}>{ev.location.split(",")[0]}</span></div>
                        <button onClick={()=>{generatePost(ev);}} disabled={generatingEventId===ev.id}
                          style={{...btn,padding:"3px 8px",fontSize:"9px",color:generatingEventId===ev.id?C.muted:"#ff8c00",border:`1px solid ${generatingEventId===ev.id?C.border:"#ff8c0044"}`,flexShrink:0,marginLeft:"6px"}}>
                          {generatingEventId===ev.id?"…":"📷"}
                        </button>
                      </div>
                    );
                  })}
                  {filteredIncidents.length>5&&<div style={{fontSize:"9px",color:C.muted,textAlign:"center",marginTop:"6px",fontFamily:"'Share Tech Mono',monospace"}}>+{filteredIncidents.length-5} more in Events tab</div>}
                </div>
              </div>
            )}

            {/* ALERTS */}
            {activeTab==="alerts"&&(
              <div style={{display:"flex",flexDirection:"column",height:"100%"}}>

                {/* Status + enable card */}
                <div style={{padding:"12px",borderBottom:`1px solid ${C.border}`,flexShrink:0,background:C.bg0}}>
                  <div style={{fontFamily:"'Orbitron',monospace",fontSize:"9px",color:C.safe,letterSpacing:"0.12em",marginBottom:"8px"}}>🔔 BROWSER NOTIFICATIONS</div>

                  {notifPermission==="unsupported"&&(
                    <div style={{fontSize:"11px",color:C.danger,padding:"8px",background:"#1a000088",border:`1px solid ${C.danger}44`,borderRadius:"4px"}}>
                      Your browser does not support notifications.
                    </div>
                  )}

                  {notifPermission==="denied"&&(
                    <div style={{fontSize:"11px",color:C.warn,padding:"8px",background:"#1a0f0088",border:`1px solid ${C.warn}44`,borderRadius:"4px",lineHeight:1.6}}>
                      <strong>Notifications are blocked.</strong><br/>
                      To enable: click the 🔒 lock icon in your browser's address bar → find "Notifications" → set to "Allow" → refresh the page.
                    </div>
                  )}

                  {notifPermission!=="denied"&&notifPermission!=="unsupported"&&(
                    <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <div>
                          <div style={{fontSize:"11px",color:C.text}}>
                            {notifEnabled?"Alerts active":"Alerts disabled"}
                          </div>
                          <div style={{fontSize:"10px",color:C.muted,marginTop:"2px"}}>
                            {notifPermission==="granted"?"Permission granted":"Permission not yet requested"}
                          </div>
                        </div>
                        <div onClick={()=>{
                          if(notifPermission==="granted"){ setNotifEnabled(v=>!v); }
                          else { requestNotifPermission(); }
                        }} style={{width:"40px",height:"20px",borderRadius:"10px",background:notifEnabled?C.safe:C.border,cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0}}>
                          <div style={{position:"absolute",top:"3px",left:notifEnabled?"22px":"3px",width:"14px",height:"14px",borderRadius:"50%",background:"white",transition:"left 0.2s"}}/>
                        </div>
                      </div>

                      {/* Trigger legend */}
                      <div style={{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:"4px",padding:"9px 10px"}}>
                        <div style={{fontSize:"8px",fontFamily:"'Orbitron',monospace",color:C.muted,letterSpacing:"0.1em",marginBottom:"7px"}}>ALERT TRIGGERS</div>
                        {[
                          {icon:"⚠",color:"#ff4444",label:"Emergency squawk 7700 / 7600 / 7500",urgency:"Urgent — sound + persistent"},
                          {icon:"💥",color:"#ff5533",label:"New accident detected in feed",urgency:"Urgent if critical/high severity"},
                          {icon:"⚡",color:C.warn,  label:"New incident detected in feed",urgency:"Standard"},
                          {icon:"◈",color:"#cc88ff",label:"AI analysis brief complete",urgency:"Standard"},
                        ].map((t,i)=>(
                          <div key={i} style={{display:"flex",alignItems:"flex-start",gap:"8px",marginBottom:"7px"}}>
                            <span style={{color:t.color,fontSize:"13px",flexShrink:0,marginTop:"1px"}}>{t.icon}</span>
                            <div>
                              <div style={{fontSize:"11px",color:C.text}}>{t.label}</div>
                              <div style={{fontSize:"9px",color:C.muted,fontFamily:"'Share Tech Mono',monospace",marginTop:"1px"}}>{t.urgency}</div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={{fontSize:"10px",color:C.muted,lineHeight:1.5,padding:"7px 9px",background:C.bg1,border:`1px solid ${C.border}`,borderRadius:"4px"}}>
                        Notifications fire while this tab is open. Each unique event fires once per session. Squawk alerts play a brief audio tone.
                      </div>
                    </div>
                  )}
                </div>

                {/* Notification log */}
                <div style={{flex:1,overflow:"auto"}}>
                  <div style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",background:C.bg0,position:"sticky",top:0,zIndex:1}}>
                    <div style={{fontFamily:"'Orbitron',monospace",fontSize:"8px",color:C.muted,letterSpacing:"0.1em"}}>
                      SESSION LOG · {recentNotifs.length} alert{recentNotifs.length!==1?"s":""}
                    </div>
                    {recentNotifs.length>0&&(
                      <button onClick={()=>setRecentNotifs([])} style={{...btn,fontSize:"8px",padding:"2px 8px",fontFamily:"'Orbitron',monospace"}}>
                        CLEAR
                      </button>
                    )}
                  </div>

                  {recentNotifs.length===0?(
                    <div style={{padding:"32px 16px",textAlign:"center",color:C.muted,fontFamily:"'Share Tech Mono',monospace",fontSize:"11px",lineHeight:1.8}}>
                      {notifEnabled?"No alerts yet this session.\nActive monitoring…":"Enable alerts above to start monitoring."}
                    </div>
                  ):(
                    recentNotifs.map(n=>{
                      const isUrgent=n.urgency==="urgent";
                      const iconColor=n.title.includes("SQUAWK")?"#ff4444":n.title.includes("ACCIDENT")?"#ff5533":n.title.includes("INCIDENT")?C.warn:"#cc88ff";
                      return(
                        <div key={n.id} style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,borderLeft:`3px solid ${isUrgent?iconColor:C.border}`,background:isUrgent?`${iconColor}07`:"transparent"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"3px"}}>
                            <div style={{fontSize:"11px",fontWeight:"600",color:isUrgent?iconColor:C.text,lineHeight:1.2,paddingRight:"6px"}}>{n.title}</div>
                            <div style={{fontSize:"9px",color:C.muted,fontFamily:"'Share Tech Mono',monospace",flexShrink:0}}>{n.time}</div>
                          </div>
                          <div style={{fontSize:"10px",color:C.muted,lineHeight:1.5}}>{n.body}</div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Event detail panel */}
          {selectedEvent&&activeTab==="events"&&(
            <div style={{borderTop:`2px solid ${C.accent}44`,background:C.bg1,height:"52%",display:"flex",flexDirection:"column"}}>
              <DetailPanel ev={selectedEvent} onClose={()=>setSelectedEvent(null)} onGeneratePost={generatePost} generating={generatingEventId===selectedEvent?.id}/>
            </div>
          )}
        </div>

      </div>{/* end body */}

      {/* ══ POST MODAL ══════════════════════════════════════════════════════ */}
      <PostModal state={postModal} onClose={()=>setPostModal(p=>({...p,open:false}))}/>

      {/* ══ AI CHAT DRAWER ══════════════════════════════════════════════════ */}
      <AIChatDrawer open={chatOpen} onToggle={()=>setChatOpen(v=>!v)} dashboardState={chatDashboardState}/>

    </div>
  );
}
