// extract-almanac-data.mjs
// One-off extraction: parses the 2026 yearbook HTML export (03_HTML/D2_1..D2_5)
// into data/almanac.mock.json (factbox + 近年大事記 timeline) and expands
// data/countries.json with ISO alpha-2 entries for every resolved country.
//
// Run manually: node scripts/extract-almanac-data.mjs
// Not wired into any build step — this repo has no bundler/build (see AGENTS.md).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HTML_DIR = path.join(ROOT, '03_HTML');
const ALMANAC_PATH = path.join(ROOT, 'data', 'almanac.mock.json');
const COUNTRIES_PATH = path.join(ROOT, 'data', 'countries.json');

const REGION_FILES = [
  'D2_1_2026亞洲.html',
  'D2_2_2026大洋洲.html',
  'D2_3_2026歐洲.html',
  'D2_4_2026美洲.html',
  'D2_5_2026非洲.html',
];

// 2026 yearbook edition -> timeline window is the last 5 calendar years covered.
const TIMELINE_MAX_YEAR = 2025;
const TIMELINE_MIN_YEAR = TIMELINE_MAX_YEAR - 4; // 2021
const TIMELINE_CAP = 5;

// Lexicographic event ranking: year always wins first (recency is the
// top-level priority, never outranked by keyword weight), then keyword
// categories break ties within the same year, in this priority order:
// milestone > key-event > Taiwan-relevance. Taiwan-relevance is a BONUS
// ONLY, never a filter — this matters most for 建國簡史 fallback events
// (see buildTimelineEvents), which are not inherently about Taiwan the way
// 與我關係 bullets are.
const KEY_EVENT_KEYWORDS = ['建交', '斷交', '復交', '互訪', '訪台', '訪問', '來訪', '接見', '簽署', '簽訂', '協定', '備忘錄'];
const MILESTONE_KEYWORDS = ['首次', '首度', '首位', '歷史性', '首開', '創下'];
const TAIWAN_KEYWORDS = ['台灣', '臺灣', '中華民國', '我國', '我方', '台北', '中華'];

function scoreEventTuple(sentence, year) {
  const hasMilestone = MILESTONE_KEYWORDS.some((k) => sentence.includes(k)) ? 1 : 0;
  const hasKeyEvent = KEY_EVENT_KEYWORDS.some((k) => sentence.includes(k)) ? 1 : 0;
  const hasTaiwan = TAIWAN_KEYWORDS.some((k) => sentence.includes(k)) ? 1 : 0; // bonus, not required
  return [year, hasMilestone, hasKeyEvent, hasTaiwan];
}

function compareScoreTuplesDesc(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return b[i] - a[i];
  }
  return 0;
}

// filename key (as it appears in "image/M_<key>.jpg") -> [iso, name_zh, name_en, flag]
const COUNTRY_META = {
  // Asia
  Taiwan: ['TW', '台灣', 'Taiwan', '🇹🇼'],
  China: ['CN', '中國大陸', 'China', '🇨🇳'],
  Afghanistan: ['AF', '阿富汗', 'Afghanistan', '🇦🇫'],
  Armenia: ['AM', '亞美尼亞', 'Armenia', '🇦🇲'],
  Azerbaijan: ['AZ', '亞塞拜然', 'Azerbaijan', '🇦🇿'],
  Bahrain: ['BH', '巴林', 'Bahrain', '🇧🇭'],
  Bangladesh: ['BD', '孟加拉', 'Bangladesh', '🇧🇩'],
  Bhutan: ['BT', '不丹', 'Bhutan', '🇧🇹'],
  Brunei: ['BN', '汶萊', 'Brunei', '🇧🇳'],
  Myanmar: ['MM', '緬甸', 'Myanmar', '🇲🇲'],
  Burma: ['MM', '緬甸', 'Myanmar', '🇲🇲'], // HTML filename alias
  Cambodia: ['KH', '柬埔寨', 'Cambodia', '🇰🇭'],
  Georgia: ['GE', '喬治亞', 'Georgia', '🇬🇪'],
  Hong_Kong: ['HK', '香港', 'Hong Kong', '🇭🇰'],
  India: ['IN', '印度', 'India', '🇮🇳'],
  Indonesia: ['ID', '印尼', 'Indonesia', '🇮🇩'],
  Iran: ['IR', '伊朗', 'Iran', '🇮🇷'],
  Iraq: ['IQ', '伊拉克', 'Iraq', '🇮🇶'],
  Israel: ['IL', '以色列', 'Israel', '🇮🇱'],
  Japan: ['JP', '日本', 'Japan', '🇯🇵'],
  Jordan: ['JO', '約旦', 'Jordan', '🇯🇴'],
  Kazakhstan: ['KZ', '哈薩克', 'Kazakhstan', '🇰🇿'],
  Korea_South: ['KR', '南韓', 'South Korea', '🇰🇷'],
  Korea_North: ['KP', '北韓', 'North Korea', '🇰🇵'],
  Kuwait: ['KW', '科威特', 'Kuwait', '🇰🇼'],
  Kyrgyzstan: ['KG', '吉爾吉斯', 'Kyrgyzstan', '🇰🇬'],
  Laos: ['LA', '寮國', 'Laos', '🇱🇦'],
  Lebanon: ['LB', '黎巴嫩', 'Lebanon', '🇱🇧'],
  Macau: ['MO', '澳門', 'Macau', '🇲🇴'],
  Malaysia: ['MY', '馬來西亞', 'Malaysia', '🇲🇾'],
  Maldives: ['MV', '馬爾地夫', 'Maldives', '🇲🇻'],
  Mongolia: ['MN', '蒙古', 'Mongolia', '🇲🇳'],
  Nepal: ['NP', '尼泊爾', 'Nepal', '🇳🇵'],
  Oman: ['OM', '阿曼', 'Oman', '🇴🇲'],
  Pakistan: ['PK', '巴基斯坦', 'Pakistan', '🇵🇰'],
  Palestine: ['PS', '巴勒斯坦', 'Palestine', '🇵🇸'],
  Philippines: ['PH', '菲律賓', 'Philippines', '🇵🇭'],
  Qatar: ['QA', '卡達', 'Qatar', '🇶🇦'],
  Saudi_Arabia: ['SA', '沙烏地阿拉伯', 'Saudi Arabia', '🇸🇦'],
  Singapore: ['SG', '新加坡', 'Singapore', '🇸🇬'],
  Sri_Lanka: ['LK', '斯里蘭卡', 'Sri Lanka', '🇱🇰'],
  Syria: ['SY', '敘利亞', 'Syria', '🇸🇾'],
  Tajikistan: ['TJ', '塔吉克', 'Tajikistan', '🇹🇯'],
  Thailand: ['TH', '泰國', 'Thailand', '🇹🇭'],
  East_Timor: ['TL', '東帝汶', 'Timor-Leste', '🇹🇱'],
  Turkey: ['TR', '土耳其', 'Turkey', '🇹🇷'],
  Turkmenistan: ['TM', '土庫曼', 'Turkmenistan', '🇹🇲'],
  United_Arab_Emirates: ['AE', '阿拉伯聯合大公國', 'United Arab Emirates', '🇦🇪'],
  Uzbekistan: ['UZ', '烏茲別克', 'Uzbekistan', '🇺🇿'],
  Vietnam: ['VN', '越南', 'Vietnam', '🇻🇳'],
  Yemen: ['YE', '葉門', 'Yemen', '🇾🇪'],
  // Oceania
  Australia: ['AU', '澳大利亞', 'Australia', '🇦🇺'],
  Samoa: ['WS', '薩摩亞', 'Samoa', '🇼🇸'],
  Norway: ['NO', '挪威', 'Norway', '🇳🇴'],
  Fiji: ['FJ', '斐濟', 'Fiji', '🇫🇯'],
  Kiribati: ['KI', '吉里巴斯', 'Kiribati', '🇰🇮'],
  Marshall_Islands: ['MH', '馬紹爾群島', 'Marshall Islands', '🇲🇭'],
  Micronesia: ['FM', '密克羅尼西亞聯邦', 'Micronesia', '🇫🇲'],
  Nauru: ['NR', '諾魯', 'Nauru', '🇳🇷'],
  New_Zealand: ['NZ', '紐西蘭', 'New Zealand', '🇳🇿'],
  Palau: ['PW', '帛琉', 'Palau', '🇵🇼'],
  Papua_New_Guinea: ['PG', '巴布亞紐幾內亞', 'Papua New Guinea', '🇵🇬'],
  Samoa: ['WS', '薩摩亞', 'Samoa', '🇼🇸'],
  Solomon_Islands: ['SB', '索羅門群島', 'Solomon Islands', '🇸🇧'],
  Tonga: ['TO', '東加', 'Tonga', '🇹🇴'],
  Tuvalu: ['TV', '吐瓦魯', 'Tuvalu', '🇹🇻'],
  Vanuatu: ['VU', '萬那杜', 'Vanuatu', '🇻🇺'],
  // Europe
  Albania: ['AL', '阿爾巴尼亞', 'Albania', '🇦🇱'],
  Andorra: ['AD', '安道爾', 'Andorra', '🇦🇩'],
  Austria: ['AT', '奧地利', 'Austria', '🇦🇹'],
  Belarus: ['BY', '白俄羅斯', 'Belarus', '🇧🇾'],
  Belgium: ['BE', '比利時', 'Belgium', '🇧🇪'],
  Bosnia_and_Herzegovina: ['BA', '波士尼亞與赫塞哥維納', 'Bosnia and Herzegovina', '🇧🇦'],
  Bulgaria: ['BG', '保加利亞', 'Bulgaria', '🇧🇬'],
  Croatia: ['HR', '克羅埃西亞', 'Croatia', '🇭🇷'],
  Cyprus: ['CY', '賽普勒斯', 'Cyprus', '🇨🇾'],
  Czech: ['CZ', '捷克', 'Czechia', '🇨🇿'],
  Denmark: ['DK', '丹麥', 'Denmark', '🇩🇰'],
  Estonia: ['EE', '愛沙尼亞', 'Estonia', '🇪🇪'],
  Finland: ['FI', '芬蘭', 'Finland', '🇫🇮'],
  France: ['FR', '法國', 'France', '🇫🇷'],
  Germany: ['DE', '德國', 'Germany', '🇩🇪'],
  Greece: ['GR', '希臘', 'Greece', '🇬🇷'],
  Vatican: ['VA', '教廷', 'Vatican City', '🇻🇦'],
  Hungary: ['HU', '匈牙利', 'Hungary', '🇭🇺'],
  Iceland: ['IS', '冰島', 'Iceland', '🇮🇸'],
  Ireland: ['IE', '愛爾蘭', 'Ireland', '🇮🇪'],
  Italy: ['IT', '義大利', 'Italy', '🇮🇹'],
  Kosovo: ['XK', '科索沃', 'Kosovo', '🇽🇰'],
  Latvia: ['LV', '拉脫維亞', 'Latvia', '🇱🇻'],
  Liechtenstein: ['LI', '列支敦斯登', 'Liechtenstein', '🇱🇮'],
  Lithuania: ['LT', '立陶宛', 'Lithuania', '🇱🇹'],
  Luxembourg: ['LU', '盧森堡', 'Luxembourg', '🇱🇺'],
  Malta: ['MT', '馬爾他', 'Malta', '🇲🇹'],
  Moldova: ['MD', '摩爾多瓦', 'Moldova', '🇲🇩'],
  Monaco: ['MC', '摩納哥', 'Monaco', '🇲🇨'],
  Montenegro: ['ME', '蒙特內哥羅', 'Montenegro', '🇲🇪'],
  Netherlands: ['NL', '荷蘭', 'Netherlands', '🇳🇱'],
  Macedonia: ['MK', '北馬其頓', 'North Macedonia', '🇲🇰'],
  Poland: ['PL', '波蘭', 'Poland', '🇵🇱'],
  Portugal: ['PT', '葡萄牙', 'Portugal', '🇵🇹'],
  Romania: ['RO', '羅馬尼亞', 'Romania', '🇷🇴'],
  Russia: ['RU', '俄羅斯', 'Russia', '🇷🇺'],
  San_Marino: ['SM', '聖馬利諾', 'San Marino', '🇸🇲'],
  Serbia: ['RS', '塞爾維亞', 'Serbia', '🇷🇸'],
  Slovakia: ['SK', '斯洛伐克', 'Slovakia', '🇸🇰'],
  Slovenia: ['SI', '斯洛維尼亞', 'Slovenia', '🇸🇮'],
  Spain: ['ES', '西班牙', 'Spain', '🇪🇸'],
  Sweden: ['SE', '瑞典', 'Sweden', '🇸🇪'],
  Switzerland: ['CH', '瑞士', 'Switzerland', '🇨🇭'],
  Ukraine: ['UA', '烏克蘭', 'Ukraine', '🇺🇦'],
  United_Kingdom: ['GB', '英國', 'United Kingdom', '🇬🇧'],
  // Americas
  Antigua_and_Barbuda: ['AG', '安提瓜及巴布達', 'Antigua and Barbuda', '🇦🇬'],
  Argentina: ['AR', '阿根廷', 'Argentina', '🇦🇷'],
  Bahamas: ['BS', '巴哈馬', 'Bahamas', '🇧🇸'],
  Barbados: ['BB', '巴貝多', 'Barbados', '🇧🇧'],
  Belize: ['BZ', '貝里斯', 'Belize', '🇧🇿'],
  Bolivia: ['BO', '玻利維亞', 'Bolivia', '🇧🇴'],
  Brazil: ['BR', '巴西', 'Brazil', '🇧🇷'],
  Canada: ['CA', '加拿大', 'Canada', '🇨🇦'],
  Chile: ['CL', '智利', 'Chile', '🇨🇱'],
  Colombia: ['CO', '哥倫比亞', 'Colombia', '🇨🇴'],
  Costa_Rica: ['CR', '哥斯大黎加', 'Costa Rica', '🇨🇷'],
  Cuba: ['CU', '古巴', 'Cuba', '🇨🇺'],
  Dominica: ['DM', '多米尼克', 'Dominica', '🇩🇲'],
  Dominican_Republic: ['DO', '多明尼加', 'Dominican Republic', '🇩🇴'],
  Dominican: ['DO', '多明尼加', 'Dominican Republic', '🇩🇴'], // HTML filename alias
  Ecuador: ['EC', '厄瓜多', 'Ecuador', '🇪🇨'],
  El_Salvador: ['SV', '薩爾瓦多', 'El Salvador', '🇸🇻'],
  Grenada: ['GD', '格瑞那達', 'Grenada', '🇬🇩'],
  Guatemala: ['GT', '瓜地馬拉', 'Guatemala', '🇬🇹'],
  Guyana: ['GY', '蓋亞那', 'Guyana', '🇬🇾'],
  Haiti: ['HT', '海地', 'Haiti', '🇭🇹'],
  Honduras: ['HN', '宏都拉斯', 'Honduras', '🇭🇳'],
  Jamaica: ['JM', '牙買加', 'Jamaica', '🇯🇲'],
  Mexico: ['MX', '墨西哥', 'Mexico', '🇲🇽'],
  Nicaragua: ['NI', '尼加拉瓜', 'Nicaragua', '🇳🇮'],
  Panama: ['PA', '巴拿馬', 'Panama', '🇵🇦'],
  Paraguay: ['PY', '巴拉圭', 'Paraguay', '🇵🇾'],
  Peru: ['PE', '秘魯', 'Peru', '🇵🇪'],
  Saint_Kitts_and_Nevis: ['KN', '聖克里斯多福及尼維斯', 'Saint Kitts and Nevis', '🇰🇳'],
  Saint_Lucia: ['LC', '聖露西亞', 'Saint Lucia', '🇱🇨'],
  Saint_Vincent_and_the_Grenadines: ['VC', '聖文森及格瑞那丁', 'Saint Vincent and the Grenadines', '🇻🇨'],
  Suriname: ['SR', '蘇利南', 'Suriname', '🇸🇷'],
  Trinidad_and_Tobago: ['TT', '千里達及托巴哥', 'Trinidad and Tobago', '🇹🇹'],
  Trinidad: ['TT', '千里達及托巴哥', 'Trinidad and Tobago', '🇹🇹'], // HTML filename alias
  United_States: ['US', '美國', 'United States', '🇺🇸'],
  Uruguay: ['UY', '烏拉圭', 'Uruguay', '🇺🇾'],
  Venezuela: ['VE', '委內瑞拉', 'Venezuela', '🇻🇪'],
  // Africa
  Algeria: ['DZ', '阿爾及利亞', 'Algeria', '🇩🇿'],
  Angola: ['AO', '安哥拉', 'Angola', '🇦🇴'],
  Benin: ['BJ', '貝南', 'Benin', '🇧🇯'],
  Botswana: ['BW', '波札那', 'Botswana', '🇧🇼'],
  Burkina_Faso: ['BF', '布吉納法索', 'Burkina Faso', '🇧🇫'],
  Burundi: ['BI', '蒲隆地', 'Burundi', '🇧🇮'],
  Cameroon: ['CM', '喀麥隆', 'Cameroon', '🇨🇲'],
  Cape_Verde: ['CV', '佛得角', 'Cape Verde', '🇨🇻'],
  Central_African_Republic: ['CF', '中非共和國', 'Central African Republic', '🇨🇫'],
  Central_African: ['CF', '中非共和國', 'Central African Republic', '🇨🇫'], // HTML filename alias
  Chad: ['TD', '查德', 'Chad', '🇹🇩'],
  Comoros: ['KM', '葛摩', 'Comoros', '🇰🇲'],
  Congo_Democratic_Republic: ['CD', '剛果民主共和國', 'Democratic Republic of the Congo', '🇨🇩'],
  Congo: ['CG', '剛果共和國', 'Republic of the Congo', '🇨🇬'],
  Cote_d_Ivoire: ['CI', '象牙海岸', "Côte d'Ivoire", '🇨🇮'],
  "Cote_d'Ivoire": ['CI', '象牙海岸', "Côte d'Ivoire", '🇨🇮'], // decoded HTML entity alias
  'Cote_d&apos;Ivoire': ['CI', '象牙海岸', "Côte d'Ivoire", '🇨🇮'], // HTML filename alias with entity
  Djibouti: ['DJ', '吉布地', 'Djibouti', '🇩🇯'],
  Egypt: ['EG', '埃及', 'Egypt', '🇪🇬'],
  Equatorial_Guinea: ['GQ', '赤道幾內亞', 'Equatorial Guinea', '🇬🇶'],
  Eritrea: ['ER', '厄利垂亞', 'Eritrea', '🇪🇷'],
  Ethiopia: ['ET', '衣索比亞', 'Ethiopia', '🇪🇹'],
  Swaziland: ['SZ', '史瓦帝尼', 'Eswatini', '🇸🇿'], // HTML filename (old name for Eswatini)
  Gabon: ['GA', '加彭', 'Gabon', '🇬🇦'],
  Gambia: ['GM', '甘比亞', 'Gambia', '🇬🇲'],
  Ghana: ['GH', '迦納', 'Ghana', '🇬🇭'],
  Guinea: ['GN', '幾內亞', 'Guinea', '🇬🇳'],
  Guinea_Bissau: ['GW', '幾內亞比紹', 'Guinea-Bissau', '🇬🇼'],
  Kenya: ['KE', '肯亞', 'Kenya', '🇰🇪'],
  Lesotho: ['LS', '賴索托', 'Lesotho', '🇱🇸'],
  Liberia: ['LR', '賴比瑞亞', 'Liberia', '🇱🇷'],
  Libya: ['LY', '利比亞', 'Libya', '🇱🇾'],
  Madagascar: ['MG', '馬達加斯加', 'Madagascar', '🇲🇬'],
  Malawi: ['MW', '馬拉威', 'Malawi', '🇲🇼'],
  Mali: ['ML', '馬利', 'Mali', '🇲🇱'],
  Mauritania: ['MR', '茅利塔尼亞', 'Mauritania', '🇲🇷'],
  Mauritius: ['MU', '模里西斯', 'Mauritius', '🇲🇺'],
  Morocco: ['MA', '摩洛哥', 'Morocco', '🇲🇦'],
  Mozambique: ['MZ', '莫三比克', 'Mozambique', '🇲🇿'],
  Namibia: ['NA', '納米比亞', 'Namibia', '🇳🇦'],
  Niger: ['NE', '尼日', 'Niger', '🇳🇪'],
  Nigeria: ['NG', '奈及利亞', 'Nigeria', '🇳🇬'],
  Rwanda: ['RW', '盧安達', 'Rwanda', '🇷🇼'],
  Sao_Tome_and_Principe: ['ST', '聖多美普林西比', 'São Tomé and Príncipe', '🇸🇹'],
  Senegal: ['SN', '塞內加爾', 'Senegal', '🇸🇳'],
  Seychelles: ['SC', '塞席爾', 'Seychelles', '🇸🇨'],
  Sierra_Leone: ['SL', '獅子山', 'Sierra Leone', '🇸🇱'],
  Somalia: ['SO', '索馬利亞', 'Somalia', '🇸🇴'],
  South_Africa: ['ZA', '南非', 'South Africa', '🇿🇦'],
  South_Sudan: ['SS', '南蘇丹', 'South Sudan', '🇸🇸'],
  Sudan: ['SD', '蘇丹', 'Sudan', '🇸🇩'],
  Togo: ['TG', '多哥', 'Togo', '🇹🇬'],
  Tanzania: ['TZ', '坦尚尼亞', 'Tanzania', '🇹🇿'],
  Tunisia: ['TN', '突尼西亞', 'Tunisia', '🇹🇳'],
  Uganda: ['UG', '烏干達', 'Uganda', '🇺🇬'],
  Zambia: ['ZM', '尚比亞', 'Zambia', '🇿🇲'],
  Zimbabwe: ['ZW', '辛巴威', 'Zimbabwe', '🇿🇼'],
};

function stripTags(html) {
  return html.replace(/<[^>]*>/g, '');
}

function decodeEntities(text) {
  const entities = {
    '&nbsp;': ' ',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&amp;': '&',
  };
  return text.replace(/&[a-zA-Z]+;/g, (m) => entities[m] || m);
}

function cleanText(text) {
  return decodeEntities(text)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\r\n]+/g, ' ')
    .trim();
}

function textFromHtml(html) {
  return cleanText(stripTags(html));
}

function segmentBlocks(html, file) {
  const blocks = [];

  // In the 2026 export, each country block ends with its own M_<key> image.
  // The block before that image contains the country's founding history,
  // relations section, and table, so image-bounded segmentation keeps all
  // extracted values traceable to the same source block.
  const imagePatternGlobal = /<img[^>]*src="[^"]*image\/M_([^/"]+?)\.(?:jpg|png)"[^>]*\/?>/gi;
  let start = 0;
  let imgMatch;
  while ((imgMatch = imagePatternGlobal.exec(html))) {
    const key = decodeEntities(imgMatch[1]);
    const span = html.slice(start, imgMatch.index + imgMatch[0].length);
    start = imgMatch.index + imgMatch[0].length;
    if (!key || !(key in COUNTRY_META)) continue;

    const headerMatch = /<p[^>]*class="D2各國簡介_(?:與我關係|國際關係)[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(span);
    const relationHeader = headerMatch ? textFromHtml(headerMatch[1]) : '';
    let relationsText = null;
    let relationsHtml = '';
    if (headerMatch) {
      const afterHeader = span.slice(headerMatch.index + headerMatch[0].length);
      const contentMatch = /<p[^>]*class="D2各國簡介_本文[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(afterHeader);
      relationsHtml = contentMatch ? contentMatch[1] : '';
      relationsText = contentMatch ? textFromHtml(contentMatch[1]) : null;
    }

    const beforeRelations = headerMatch ? span.slice(0, headerMatch.index) : span;
    const foundingHistoryText = textFromHtml(
      beforeRelations.replace(/<p[^>]*class="D2各國簡介_建國簡史[^"]*"[^>]*>[\s\S]*?<\/p>/gi, '')
    );

    const tableMatch = /<table[^>]*>[\s\S]*?<\/table>/i.exec(span);
    const tableHtml = tableMatch ? tableMatch[0] : '';

    blocks.push({ key, file, relationsText, relationsHtml, relationHeader, foundingHistoryText, tableHtml });
  }

  return blocks;
}

function identifyCountry(relationsText, proseText, candidates) {
  for (const candidate of candidates) {
    if (relationsText && relationsText.includes(candidate)) return candidate;
    if (proseText.includes(candidate)) return candidate;
  }
  return null;
}

function parseTable(tableHtml) {
  const result = {};
  // Extract paragraphs from table cells containing basic data
  const pPattern = /<p[^>]*class="D2各國簡介_表格黑字[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pPattern.exec(tableHtml))) {
    const pContent = match[1];
    // Split on full-width space (　) to separate label:value pairs
    const pairs = decodeEntities(stripTags(pContent)).split(/\s{2,}|　{1,}/);
    for (const pair of pairs) {
      const colonIdx = pair.indexOf('：') >= 0 ? pair.indexOf('：') : pair.indexOf(':');
      if (colonIdx > 0) {
        const label = pair.slice(0, colonIdx).trim();
        const value = pair.slice(colonIdx + 1).trim();
        if (label && value && ['首都', '語言', '人口', '面積', '地理位置'].includes(label)) {
          result[label] = value;
        }
      }
    }
  }
  return result;
}

function detectRelations(relationsText) {
  if (!relationsText) return null;
  const SELF_REF = /我國?|中華民國|臺灣|台灣|兩國/;
  const HEDGE_WORDS = /有意|擬|考慮|可能|傳出|報導|研議/;
  const SEVER_RE = /無邦交|斷交|終止.*?關係|斷絕.*?關係|中止.*?關係/;
  const ESTABLISH_RE = /建交/;

  const sentences = relationsText.split(/[。\n]/).map((s) => s.trim()).filter(Boolean);
  let last = null;
  for (const sentence of sentences) {
    const clauses = sentence.split(/[，,]/).map((s) => s.trim()).filter(Boolean);
    let sentenceType = null;
    for (const clause of clauses) {
      if (SEVER_RE.test(clause)) {
        sentenceType = 'sever';
      } else if (sentenceType !== 'sever' && ESTABLISH_RE.test(clause) && SELF_REF.test(clause) && !HEDGE_WORDS.test(clause)) {
        sentenceType = 'establish';
      }
    }
    if (sentenceType) last = { type: sentenceType, sentence };
  }
  return last && last.type === 'establish' ? `${last.sentence}。` : null;
}

// A bare date is often followed directly by a qualifier word with no comma
// in between — "起" (since), "初/中/底" or "上旬/中旬/下旬" (part of the
// month), "凌晨" (time of day), or a range-closing "至/到X日" or
// "至/到X月Y日" (same-month or cross-month range end) — before the real
// substantive clause begins. Left unconsumed, that qualifier becomes the
// sole text before the first comma and produces a meaningless title (e.g.
// "2015年起，我國國民…" -> title "起" instead of the real clause). Longer
// qualifiers are listed before any single-character prefix they contain
// (中旬/上旬/下旬 before 中), and the cross-month range form before the
// same-month form, so the alternation doesn't stop early on a partial match.
const DATE_QUALIFIER = '(?:中旬|上旬|下旬|起|初|底|中|凌晨|[至到]\\d{1,2}月\\d{1,2}日|[至到]\\d{1,2}日)?';

function parseStarBullets(relationsText, windowed = true, source = {}) {
  if (!relationsText) return [];
  const bullets = relationsText.split('★').slice(1);
  const out = [];
  for (const raw of bullets) {
    const trimmed = raw.trim();
    const leadingRe = new RegExp(`^(\\d{4})年(?:(\\d{1,2})月(?:(\\d{1,2})日)?)?${DATE_QUALIFIER}`);
    const leadingMatch = leadingRe.exec(trimmed);
    if (!leadingMatch) continue;
    const bulletYear = parseInt(leadingMatch[1], 10);
    const leadingMonth = leadingMatch[2] || null;
    const leadingDay = leadingMatch[3] || null;

    const afterLeading = trimmed
      .slice(leadingMatch[0].length)
      .replace(/^、\d{1,2}日[，,]?\s*/, '')
      .replace(/^[，,]\s*/, '');

    // A single ★ bullet in the source often bundles MULTIPLE dated
    // sub-events under one shared leading year, written as consecutive
    // 。- or ；-terminated clauses where each subsequent clause begins with
    // its own "[YYYY年]X月Y日" marker instead of starting a new ★ (e.g.
    // Japan's 2024年2月6日 bullet runs on through five distinct dated
    // events — TSMC's Kumamoto fab, the Emperor's birthday reception, a
    // fishing-season agreement, the Hualien earthquake, and a Diet
    // delegation visit — with no ★ separating them). Split on clause
    // boundaries and treat any clause beginning with its own date marker
    // as a separate event, inheriting the bullet's leading year when a
    // clause doesn't restate one.
    const sentences = afterLeading.split(/(?<=[。；])/).map((s) => s.trim()).filter(Boolean);
    // Sub-events' own dates can be followed by the same trailing qualifier
    // words as a bullet's leading date (e.g. "6月21日起，陸委會宣布…" or
    // "11月中旬，貝里斯…遭颶風重創…") — reuse DATE_QUALIFIER here too, or
    // the qualifier is left dangling as the sub-event's entire title.
    const subDateRe = new RegExp(`^(?:(\\d{4})年)?(\\d{1,2})月(?:(\\d{1,2})日)?${DATE_QUALIFIER}`);

    let current = { year: bulletYear, month: leadingMonth, day: leadingDay, parts: [] };
    const bulletEvents = [];
    for (const sentence of sentences) {
      const dm = subDateRe.exec(sentence);
      if (dm) {
        if (current.parts.length > 0) bulletEvents.push(current);
        const year = dm[1] ? parseInt(dm[1], 10) : bulletYear;
        const remainder = sentence
          .slice(dm[0].length)
          .replace(/^、\d{1,2}日[，,]?\s*/, '')
          .replace(/^[，,]\s*/, '');
        current = { year, month: dm[2], day: dm[3] || null, parts: remainder ? [remainder] : [] };
      } else {
        current.parts.push(sentence);
      }
    }
    if (current.parts.length > 0) bulletEvents.push(current);

    for (const ev of bulletEvents) {
      const year = ev.year;
      if (year > TIMELINE_MAX_YEAR) continue;
      if (windowed && year < TIMELINE_MIN_YEAR) continue;
      const month = ev.month ? ev.month.padStart(2, '0') : null;
      const day = ev.day ? ev.day.padStart(2, '0') : null;
      const date = month ? `${year}-${month}${day ? '-' + day : ''}` : `${year}`;
      let sentence = ev.parts.join('').trim();
      if (!sentence) continue;
      sentence = sentence.replace(/；$/, '。');
      if (!sentence.endsWith('。')) sentence = `${sentence}。`;
      out.push({
        year,
        date,
        sentence,
        sortKey: `${year}-${month || '00'}-${day || '00'}`,
        source: { ...source, quote: sentence },
      });
    }
  }
  return out;
}

function parseDatedSentences(text, source = {}) {
  if (!text) return [];
  const sentences = text.split(/(?<=。)/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const sentence of sentences) {
    const ym = /(\d{4})年(?:(\d{1,2})月(?:(\d{1,2})日)?)?/.exec(sentence);
    if (!ym) continue;
    const year = parseInt(ym[1], 10);
    if (year > TIMELINE_MAX_YEAR) continue;
    const month = ym[2] ? ym[2].padStart(2, '0') : null;
    const day = ym[3] ? ym[3].padStart(2, '0') : null;
    const date = month ? `${year}-${month}${day ? '-' + day : ''}` : `${year}`;
    out.push({
      year,
      date,
      sentence,
      sortKey: `${year}-${month || '00'}-${day || '00'}`,
      source: { ...source, quote: sentence },
    });
  }
  return out;
}

function makeTitle(sentence, countryName) {
  const firstClause = sentence.split(/[，,。]/)[0].replace(/[（(][^）)]*[）)]/g, '').trim();
  if (/^(復交|斷交|建交|來訪|訪台|訪問|簽署|簽訂)$/.test(firstClause) && countryName) {
    return `${countryName}${firstClause}`;
  }
  return firstClause;
}

function buildTimelineSection(block, countryName) {
  const relationSource = {
    file: `03_HTML/${block.file}`,
    country: countryName,
    section: block.relationHeader || '與我關係',
  };
  const foundingSource = {
    file: `03_HTML/${block.file}`,
    country: countryName,
    section: '建國簡史',
  };

  let kind = 'recent';
  let candidates = parseStarBullets(block.relationsText, true, relationSource);
  if (candidates.length === 0) {
    kind = 'relations';
    candidates = parseStarBullets(block.relationsText, false, relationSource);
  }
  if (candidates.length === 0) {
    kind = 'history';
    candidates = parseDatedSentences(block.foundingHistoryText, foundingSource);
  }
  if (candidates.length === 0) return null;

  const scored = candidates.map((c) => ({ ...c, scoreTuple: scoreEventTuple(c.sentence, c.year) }));
  scored.sort((a, b) => compareScoreTuplesDesc(a.scoreTuple, b.scoreTuple) || b.sortKey.localeCompare(a.sortKey));
  const top = scored.slice(0, TIMELINE_CAP);
  top.sort((a, b) => b.sortKey.localeCompare(a.sortKey));

  const title = kind === 'recent'
    ? `近年大事記（${TIMELINE_MIN_YEAR}-${TIMELINE_MAX_YEAR}）`
    : kind === 'relations'
      ? '關係大事記'
      : '建國簡史摘錄';

  const events = top.map(({ date, sentence, source }) => {
    // The title is the complete first clause — up to the first comma OR
    // period, whichever comes first — never character-count-truncated
    // with an ellipsis. A fixed-length cutoff regularly severed the
    // clause mid-word (e.g. "由眾議員石破茂、前外務大臣前原誠司率…" lost
    // its own verb, "率團訪台"). Splitting on period too (not just comma)
    // additionally prevents the title from running on across a genuinely
    // separate follow-up sentence within the same event's desc (e.g. a
    // continuation sentence with no date of its own, glued onto the
    // previous event by the sub-event splitter above).
    //
    // Strip parenthetical asides (foreign-name romanizations, e.g.
    // "穆雅辛（H.E Yasin Hagi Mohamoud）" -> "穆雅辛") from the TITLE only —
    // the CJK name/term already carries the meaning, and the romanization
    // is purely decorative padding. desc keeps the full text with parens
    // intact. Cutting at enumeration commas (、) or other mid-clause
    // delimiters was tried and rejected: it routinely severed the subject
    // from its own verb (e.g. "阿聯親王、阿聯酋航空董事會主席...搭乘...來訪"
    // collapsed to just "阿聯親王", losing the entire action).
    return { date, title: makeTitle(sentence, countryName), desc: sentence, source };
  });

  return { type: 'timeline', title, events };
}

function main() {
  const almanac = {};
  const newCountries = {};

  let blocksScanned = 0;
  let resolvedCount = 0;
  const unresolved = [];

  for (const file of REGION_FILES) {
    const filePath = path.join(HTML_DIR, file);
    if (!fs.existsSync(filePath)) continue;
    const html = fs.readFileSync(filePath, 'utf-8');

    const blocks = segmentBlocks(html, file);
    blocksScanned += blocks.length;

    for (const block of blocks) {
      const { key, relationsText, tableHtml } = block;
      const meta = COUNTRY_META[key];
      if (!meta) {
        unresolved.push(`[unresolved] key '${key}' not in COUNTRY_META, file ${file}`);
        continue;
      }

      const [iso, name_zh, name_en, flag] = meta;
      if (almanac[iso]) {
        console.log(`[duplicate match for ${iso} (${name_zh}) in ${file}, keeping first occurrence]`);
        continue;
      }

      const tableData = parseTable(tableHtml);
      const factbox = [
        { label: '首都', value: tableData['首都'] || '' },
        { label: '語言', value: tableData['語言'] || '' },
        { label: '人口', value: tableData['人口'] || '' },
        { label: '面積', value: tableData['面積'] || '' },
        { label: '地理位置', value: tableData['地理位置'] || '' },
      ];

      const relationsField = detectRelations(relationsText);
      if (relationsField) {
        factbox.push({ label: '邦交', value: relationsField });
      }

      const timelineSection = buildTimelineSection(block, name_zh);
      const sections = timelineSection ? [timelineSection] : [];

      almanac[iso] = {
        iso,
        name_zh,
        name_en,
        flag,
        source: { file: `03_HTML/${file}`, key },
        factbox,
        sections,
      };
      newCountries[iso] = { iso, name_zh, name_en };
      resolvedCount++;
    }
  }

  // Merge per-key with existing fields as the base, so enrichment data
  // added by later scripts (capital/bbox geocoding) survives a re-run of
  // this extraction — newCountries only ever sets {iso, name_zh, name_en},
  // so overlaying it onto existing[iso] refreshes just those three fields
  // without discarding bbox/capital. A flat `{...existing, ...newCountries}`
  // spread (the previous approach) put newCountries last, silently wiping
  // out bbox/capital for every country touched by this run on each re-run.
  const existing = fs.existsSync(COUNTRIES_PATH) ? JSON.parse(fs.readFileSync(COUNTRIES_PATH, 'utf-8')) : {};
  const merged = { ...existing };
  for (const [iso, rec] of Object.entries(newCountries)) {
    merged[iso] = { ...existing[iso], ...rec };
  }

  fs.writeFileSync(ALMANAC_PATH, `${JSON.stringify(almanac, null, 2)}\n`, 'utf-8');
  fs.writeFileSync(COUNTRIES_PATH, `${JSON.stringify(merged, null, 2)}\n`, 'utf-8');

  console.log(`Blocks scanned: ${blocksScanned}`);
  console.log(`Resolved entries written: ${resolvedCount}`);
  console.log(`countries.json entries added: ${Object.keys(newCountries).length}`);
  const withBangjiao = Object.values(almanac).filter((e) => e.factbox.some((f) => f.label === '邦交')).length;
  console.log(`Entries with 邦交 field: ${withBangjiao}`);
  if (unresolved.length > 0) {
    console.log(`Unresolved: ${unresolved.length}`);
    unresolved.forEach((u) => console.log(`  ${u}`));
  }
}

main();
