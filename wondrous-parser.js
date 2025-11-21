const fs = require('fs');
const path = require('path');

const INBOUND = path.join(__dirname, 'inbound.txt');
const PRICE_TABLE = path.join(__dirname, 'priceTable.json');
const OUT = path.join(__dirname, 'wondrous.json');

const rarityOrder = ['Legendary', 'Very Rare', 'Rare', 'Uncommon', 'Common', 'Unknown Rarity', 'Varies'];

function readAll() {
  return fs.readFileSync(INBOUND, 'utf8').split(/\r?\n/);
}

function loadPriceTable() {
  try {
    return JSON.parse(fs.readFileSync(PRICE_TABLE, 'utf8'));
  } catch (e) {
    console.error('Failed to load price table', e);
    return {};
  }
}

function extractRarity(categoryLine) {
  if (!categoryLine) return 'Rare';
  for (const r of rarityOrder) {
    if (categoryLine.includes(r)) return r === 'Unknown Rarity' ? 'Rare' : r;
  }
  // fallback
  if (/Unknown/i.test(categoryLine)) return 'Rare';
  return 'Rare';
}

function getAttunementInfo(categoryLine) {
  if (!categoryLine) return '';
  const m = categoryLine.match(/requires attunement(?: by a?n? )?(.+?)\)?$/i);
  if (m) {
    const by = m[1] ? m[1].trim() : '';
    if (by && by.length > 0) {
      const formatted = by.replace(/\)$/,'').trim();
      if (formatted.length === 0) return 'Requires Attunement';
      return `Requires Attunement by ${formatted}`;
    }
    return 'Requires Attunement';
  }
  if (/requires attunement/i.test(categoryLine)) return 'Requires Attunement';
  return '';
}

function isLegacyName(line) {
  return /^Legacy/.test(line) || /^Legacy\u2022/.test(line) || /^Legacy\s*•/.test(line);
}

function lookupPrice(name, priceData) {
  if (!priceData) return 'NA';
  const tries = [name, name.replace(/,\s*/g, ''), name.replace(/\s+\(.*\)$/,'')];
  for (const t of tries) {
    if (priceData.hasOwnProperty(t)) {
      return convertPriceToNumber(priceData[t]);
    }
  }
  // case-insensitive search as a last resort
  const lower = name.toLowerCase();
  for (const k of Object.keys(priceData)) {
    if (k.toLowerCase() === lower) return convertPriceToNumber(priceData[k]);
  }
  return 'NA';
}

function convertPriceToNumber(v) {
  if (v === undefined || v === null) return 'NA';
  if (typeof v === 'number') return v;
  const s = String(v).replace(/gp/gi, '').replace(/,/g, '').trim();
  if (s === '--' || s.length === 0) return 'NA';
  const n = Number(s);
  return Number.isFinite(n) ? n : 'NA';
}

function getWhereAndGacha(rarity) {
  // Rare and Very Rare use the new gacha format; Legendary remains research but keeps original format
  const researchRanks = ['Rare', 'Very Rare', 'Legendary'];
  if (researchRanks.includes(rarity)) {
    if (rarity === 'Rare' || rarity === 'Very Rare') {
      return { where_get: 'Research', gacha: `${rarity} Wonderous Research` };
    }
    // fallback for Legendary or other future ranks
    return { where_get: 'Research', gacha: `${rarity} Wondrous Item Research` };
  }
  return { where_get: 'Magicians Menagerie' };
}

function parseWondrous() {
  const lines = readAll();
  const priceData = loadPriceTable();
  const items = [];
  const tracker = new Map();

  let i = 0;
  while (i < lines.length) {
    let line = lines[i].trim();
    // detect start of an item: a non-empty line followed by 'Wondrous item'
    if (line && i + 1 < lines.length && lines[i+1].trim().toLowerCase().startsWith('wondrous item')) {
      let rawName = line;
      let isLegacy = false;
      if (isLegacyName(rawName)) {
        isLegacy = true;
        rawName = rawName.replace(/^Legacy\s*\u2022?\s*/i, '').trim();
      }

      // advance to category line after any 'Add' scaffolding
      let j = i + 1; // should be 'Wondrous item'
      // next few lines may include 'Add' and the category line
      while (j < lines.length && !/wondrous item[,\s]/i.test(lines[j])) {
        j++;
      }
      // find the category line (like: Wondrous item, Common (requires attunement))
      let categoryLine = '';
      if (j+1 < lines.length) {
        categoryLine = lines[j+1] ? lines[j+1].trim() : '';
        // sometimes the category is on the same line as 'Wondrous item,'
        if (/Wondrous item,?/i.test(lines[j]) && lines[j].includes(',')) {
          const after = lines[j].split(',').slice(1).join(',').trim();
          if (after) categoryLine = after;
        }
      }

      const rarity = extractRarity(categoryLine || lines[j+1] || '');
      const att = getAttunementInfo(categoryLine || '');

      // description starts after 'Source:' line typically; find it
      let srcIdx = j;
      // find 'Source:' label within next 10 lines
      for (let k = j; k < Math.min(lines.length, j+12); k++) {
        if (/^Source:/i.test(lines[k].trim())) { srcIdx = k; break; }
      }
      let descStart = srcIdx + 1;
      // gather description until 'Amount to add' or 'Add Item' or blank item header
      const descLines = [];
      for (let k = descStart; k < lines.length; k++) {
        const L = lines[k];
        if (/^Amount to add/i.test(L) || /^Add Item/i.test(L) || (/^\S+\r?$/i.test(L) && k > descStart && /Wondrous item/i.test(lines[k+1] || ''))) {
          break;
        }
        // skip Weight/Cost/Tags/Version/Capacity lines often present near top
        if (/^(Weight:|Cost:|Tags:|Version:|Capacity:|Amount to add)/i.test(L.trim())) continue;
        descLines.push(L);
      }
      const rawDesc = descLines.join('\n').trim();
      const description = cleanDescription(rawDesc);

      const price = lookupPrice(rawName, priceData);

      const item = { name: rawName, rarity, price, where_get: getWhereAndGacha(rarity).where_get };
      if (att) item.attunement = att;
      const gachaInfo = getWhereAndGacha(rarity);
      if (gachaInfo.gacha) item.gacha = gachaInfo.gacha;
      if (description) item.description = description;

      // dedupe: prefer Legacy versions
      const key = rawName.toLowerCase();
      const existing = tracker.get(key);
      if (existing) {
        // if existing is non-legacy and this is legacy, replace
        if (!existing.isLegacy && isLegacy) {
          tracker.set(key, { item, isLegacy });
        }
        // otherwise keep existing
      } else {
        tracker.set(key, { item, isLegacy });
      }

      items.push(item);

      // advance i to after the encountered 'Amount to add' or next 'Add Item' marker
      let advanceTo = i + 1;
      for (let k = i+1; k < lines.length; k++) {
        if (/^Amount to add/i.test(lines[k]) || /^Add Item/i.test(lines[k])) { advanceTo = k+1; break; }
      }
      i = advanceTo;
      continue;
    }
    i++;
  }

  // Build deduped array from tracker (which applied legacy preference)
  const final = Array.from(tracker.values()).map(v => v.item);
  fs.writeFileSync(OUT, JSON.stringify(final, null, 2), 'utf8');
  console.log(`PARSED ${final.length} WONDROUS ITEMS`);
}

function cleanDescription(s) {
  if (!s) return '';
  // remove repeated 'Illusion Seeds' blocks and common footer markers
  let out = s.replace(/\nTags:[\s\S]*/i, '').trim();
  out = out.replace(/(?:\r?\n){2,}/g, '\n\n');
  // trim leftover label lines like 'Source:' if present
  out = out.replace(/^Source:\s*/i, '');
  return out.trim();
}

// Run
parseWondrous();
