// extract-almanac-data.mjs
// One-off extraction: parses the 2025 yearbook HTML export (HTML/D2_1..D2_5)
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
const HTML_DIR = path.join(ROOT, 'HTML');
const ALMANAC_PATH = path.join(ROOT, 'data', 'almanac.mock.json');
const COUNTRIES_PATH = path.join(ROOT, 'data', 'countries.json');

const REGION_FILES = [
  'D2_1_2025亞洲_1126.html',
  'D2_2_2025大洋洲.html',
  'D2_3_2025歐洲.html',
  'D2_4_2025美洲.html',
  'D2_5_2025非洲.html',
];

// 2025 yearbook edition -> timeline window is the last 5 calendar years covered.
const TIMELINE_MAX_YEAR = 2024;
const TIMELINE_MIN_YEAR = TIMELINE_MAX_YEAR - 4; // 2020
const TIMELINE_CAP = 5;

// Keyword-weighted event scoring. Recency is the base score (more recent =
// higher); each keyword category adds a flat bonus if any of its keywords
// appear in the event's sentence (checked once per category, not stacked
// per keyword match). Taiwan-relevance is a BONUS ONLY, never a filter —
// this matters most for 建國簡史 fallback events (see buildTimelineEvents),
// which are not inherently about Taiwan the way 與我關係 bullets are.
const KEY_EVENT_KEYWORDS = ['建交', '斷交', '復交', '互訪', '訪台', '訪問', '來訪', '接見', '簽署', '簽訂', '協定', '備忘錄'];
const MILESTONE_KEYWORDS = ['首次', '首度', '首位', '歷史性', '首開', '創下'];
const TAIWAN_KEYWORDS = ['台灣', '臺灣', '中華民國', '我國', '我方', '台北', '中華'];

function scoreEventText(sentence, year) {
  let score = year - TIMELINE_MIN_YEAR + 1; // recency: TIMELINE_MIN_YEAR -> 1 ... TIMELINE_MAX_YEAR -> 5
  if (KEY_EVENT_KEYWORDS.some((k) => sentence.includes(k))) score += 3;
  if (MILESTONE_KEYWORDS.some((k) => sentence.includes(k))) score += 2;
  if (TAIWAN_KEYWORDS.some((k) => sentence.includes(k))) score += 1; // bonus, not required
  return score;
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
  Lebanon: ['LB', '黎巴嫩', 'Lebanon', '🇱🇧'],
  Macau: ['MO', '澳門', 'Macau', '🇲🇴'],
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
  East_Timor: ['TL', '東帝汶', 'Timor-Leste', '🇹🇱'],
  Turkey: ['TR', '土耳其', 'Turkey', '🇹🇷'],
  Turkmenistan: ['TM', '土庫曼', 'Turkmenistan', '🇹🇲'],
  United_Arab_Emirates: ['AE', '阿拉伯聯合大公國', 'United Arab Emirates', '🇦🇪'],
  Uzbekistan: ['UZ', '烏茲別克', 'Uzbekistan', '🇺🇿'],
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
  Romania: ['RO', '羅馬尼亞', 'Romania', '🇷🇴'],
  Russia: ['RU', '俄羅斯', 'Russia', '🇷🇺'],
  San_Marino: ['SM', '聖馬利諾', 'San Marino', '🇸🇲'],
  Slovakia: ['SK', '斯洛伐克', 'Slovakia', '🇸🇰'],
  Slovenia: ['SI', '斯洛維尼亞', 'Slovenia', '🇸🇮'],
  Sweden: ['SE', '瑞典', 'Sweden', '🇸🇪'],
  Switzerland: ['CH', '瑞士', 'Switzerland', '🇨🇭'],
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

function extractRelationsText(proseHtml) {
  const headerRe = /<p class="D2各國簡介_(?:與我關係|國際關係)[^"]*"[^>]*>[\s\S]*?<\/p>/;
  const hm = headerRe.exec(proseHtml);
  if (!hm) return null;
  const headerEnd = hm.index + hm[0].length;
  const nextHeader = /<p class="D2各國簡介[^"]*"[^>]*>[\s\S]*?<\/p>/.exec(proseHtml.slice(headerEnd));
  const endIdx = nextHeader ? headerEnd + nextHeader.index : proseHtml.length;
  const scoped = proseHtml.slice(headerEnd, endIdx);
  return decodeEntities(stripTags(scoped)).trim();
}

function extractFoundingHistoryText(proseHtml) {
  const headerRe = /<p class="D2各國簡介_(?:與我關係|國際關係)[^"]*"[^>]*>[\s\S]*?<\/p>/;
  const hm = headerRe.exec(proseHtml);
  const scoped = hm ? proseHtml.slice(0, hm.index) : proseHtml;
  // Strip out the 建國簡史 heading paragraph itself so its literal text
  // doesn't bleed into the narrative.
  const headingRemoved = scoped.replace(/<p class="D2各國簡介_建國簡史[^"]*"[^>]*>[\s\S]*?<\/p>/, '');
  return decodeEntities(stripTags(headingRemoved)).trim();
}

function segmentBlocks(html, fileName) {
  const blocks = [];
  const isSelfEntryFile = fileName.includes('亞洲') && fileName.includes('1126');

  // Split by country image tags: <img src="...image/M_<key>.jpg"
  const imagePattern = /<img[^>]*src="[^"]*image\/M_(\w+)\.jpg"[^>]*\/>/g;
  let match;
  let lastIndex = 0;
  let selfIndex = 0;
  const matches = [];

  while ((match = imagePattern.exec(html))) {
    matches.push({ key: match[1], index: match.index });
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];
    const blockStart = current.index;
    const blockEnd = next ? next.index : html.length;
    const block = html.slice(blockStart, blockEnd);

    const relationsMatch = /class="D2各國簡介_(?:與我關係|國際關係)[^"]*"[^>]*>([\s\S]*?)(?=<p class="D2各國簡介_[^"]*"|<div|<table|$)/i.exec(block);
    const relationsText = relationsMatch ? decodeEntities(stripTags(relationsMatch[1])).trim() : null;

    const foundingMatch = /class="D2各國簡介_建國簡史[^"]*"[^>]*>([\s\S]*?)(?=<p class="D2各國簡介_[^"]*"|<table|$)/i.exec(block);
    const foundingHistoryText = foundingMatch ? decodeEntities(stripTags(foundingMatch[1])).trim() : '';

    const tableMatch = /<table[^>]*>[\s\S]*?<\/table>/i.exec(block);
    const tableHtml = tableMatch ? tableMatch[0] : '';

    let key;
    if (isSelfEntryFile && selfIndex === 0) {
      key = 'Taiwan';
      selfIndex++;
    } else if (isSelfEntryFile && selfIndex === 1) {
      key = 'China';
      selfIndex++;
    } else {
      // Direct match in COUNTRY_META
      key = (current.key in COUNTRY_META) ? current.key : null;
    }

    if (key && COUNTRY_META[key]) {
      blocks.push({ key, relationsText, foundingHistoryText, tableHtml });
    }
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

function parseStarBullets(relationsText, windowed = true) {
  if (!relationsText) return [];
  const bullets = relationsText.split('★').slice(1);
  const out = [];
  for (const raw of bullets) {
    const dm = /^(\d{4})年(?:(\d{1,2})月(?:(\d{1,2})日)?)?/.exec(raw.trim());
    if (!dm) continue;
    const year = parseInt(dm[1], 10);
    if (year > TIMELINE_MAX_YEAR) continue;
    if (windowed && year < TIMELINE_MIN_YEAR) continue;
    const month = dm[2] ? dm[2].padStart(2, '0') : null;
    const day = dm[3] ? dm[3].padStart(2, '0') : null;
    const date = month ? `${year}-${month}${day ? '-' + day : ''}` : `${year}`;
    const rest = raw.trim().slice(dm[0].length).replace(/^[，,]\s*/, '').trim();
    if (!rest) continue;
    const sentence = rest.endsWith('。') ? rest : `${rest}。`;
    out.push({ year, date, sentence, sortKey: `${year}-${month || '00'}-${day || '00'}` });
  }
  return out;
}

function parseDatedSentences(text) {
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
    out.push({ year, date, sentence, sortKey: `${year}-${month || '00'}-${day || '00'}` });
  }
  return out;
}

function buildTimelineEvents(relationsText, foundingHistoryText) {
  let candidates = parseStarBullets(relationsText, true);
  if (candidates.length === 0) candidates = parseStarBullets(relationsText, false);
  if (candidates.length === 0) candidates = parseDatedSentences(foundingHistoryText);
  if (candidates.length === 0) return [];

  const scored = candidates.map((c) => ({ ...c, score: scoreEventText(c.sentence, c.year) }));
  scored.sort((a, b) => b.score - a.score || b.sortKey.localeCompare(a.sortKey));
  const top = scored.slice(0, TIMELINE_CAP);
  top.sort((a, b) => b.sortKey.localeCompare(a.sortKey));

  return top.map(({ date, sentence }) => {
    const firstClause = sentence.split(/[，,]/)[0];
    const title = firstClause.length <= 20 ? firstClause.replace(/。$/, '') : `${firstClause.slice(0, 18)}…`;
    return { date, title, desc: sentence };
  });
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

    for (const { key, relationsText, foundingHistoryText, tableHtml } of blocks) {
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

      const events = buildTimelineEvents(relationsText, foundingHistoryText);
      const sections = events.length > 0 ? [{ type: 'timeline', title: '近年大事記', events }] : [];

      almanac[iso] = { iso, name_zh, name_en, flag, factbox, sections };
      newCountries[iso] = { iso, name_zh, name_en };
      resolvedCount++;
    }
  }

  const existing = fs.existsSync(COUNTRIES_PATH) ? JSON.parse(fs.readFileSync(COUNTRIES_PATH, 'utf-8')) : {};
  const merged = { ...existing, ...newCountries };

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
