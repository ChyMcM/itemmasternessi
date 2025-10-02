const fs = require('fs');

// Function to parse all wands from inbound.txt
function parseWandsFromInbound() {
    console.log('=== PARSING WANDS FROM INBOUND.TXT ===');
    
    let data;
    try {
        data = fs.readFileSync('inbound.txt', 'utf8');
    } catch (error) {
        console.error('Error reading inbound.txt:', error.message);
        return [];
    }

    // Load price data
    let priceData = {};
    try {
        const priceJson = fs.readFileSync('priceTable.json', 'utf8');
        priceData = JSON.parse(priceJson);
    } catch (error) {
        console.warn('Warning: Could not load priceTable.json:', error.message);
    }

    const lines = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const wands = [];
    const wandTracker = new Map(); // Track wands to handle duplicates and Legacy versions
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Look for wand names - either lines that contain "Wand" but aren't category lines,
        // or lines where the next line is "Wand" (like "Radiance")
        const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
        
        if ((line.includes('Wand') && 
             !line.includes('Wand,') && 
             !line.startsWith('Legacy') &&
             !line.includes('holding') &&
             !line.includes('wand') &&
             !line.includes('spell') &&
             !line.includes('charges') &&
             !line.includes('action') &&
             !line.includes('expend') &&
             line !== 'Wand' &&
             line !== 'LegacyWand') ||
            (nextLine === 'Wand' && 
             !line.includes('Add Item') &&
             !line.includes('Amount') &&
             line.length > 2)) {
            
            console.log(`\n=== PROCESSING: ${line} ===`);
            const wand = parseWandEntry(lines, i, priceData);
            if (wand) {
                // Determine if this is a Legacy version
                const isLegacy = i + 1 < lines.length && lines[i + 1] === 'LegacyWand';
                
                // Check for duplicates and prioritize Legacy versions
                const existingWand = wandTracker.get(wand.name);
                if (existingWand) {
                    // If we already have this wand, only replace if current one is Legacy
                    if (isLegacy && !existingWand.isLegacy) {
                        // Replace non-Legacy with Legacy version
                        const index = wands.findIndex(w => w.name === wand.name);
                        if (index !== -1) {
                            wands[index] = wand;
                            wandTracker.set(wand.name, { ...wand, isLegacy: true });
                            console.log(`Replaced non-Legacy with Legacy version: ${wand.name}`);
                        }
                    } else {
                        console.log(`Skipping duplicate: ${wand.name}`);
                    }
                    // Otherwise skip this duplicate
                } else {
                    // New wand, add it
                    wands.push(wand);
                    wandTracker.set(wand.name, { ...wand, isLegacy });
                }
            }
        }
    }
    
    console.log(`\n=== PARSED ${wands.length} WANDS ===`);
    
    // Count by rarity
    const rarityCount = {};
    wands.forEach(wand => {
        const rarity = wand.rarity || 'Unknown';
        rarityCount[rarity] = (rarityCount[rarity] || 0) + 1;
    });
    
    console.log('\n=== FINAL RARITY DISTRIBUTION ===');
    Object.entries(rarityCount)
        .sort(([,a], [,b]) => b - a)
        .forEach(([rarity, count]) => {
            console.log(`${rarity}: ${count} wands`);
        });
    console.log(`Total: ${wands.length} wands`);
    
    return wands;
}

// Function to parse a single wand entry
function parseWandEntry(lines, startIndex, priceData) {
    const nameOrTitle = lines[startIndex];
    let currentIndex = startIndex + 1;
    
    // Skip type line (e.g., "Wand" or "LegacyWand")
    if (currentIndex < lines.length && 
        (lines[currentIndex] === 'Wand' || 
         lines[currentIndex] === 'LegacyWand' ||
         lines[currentIndex] === 'Legacy Wand')) {
        currentIndex++;
    }
    
    // Skip "Add" line
    if (currentIndex < lines.length && lines[currentIndex] === 'Add') {
        currentIndex++;
    }
    
    // Get category line (contains rarity and attunement info)
    if (currentIndex >= lines.length) {
        console.log('No category line found');
        return null;
    }
    
    const categoryLine = lines[currentIndex];
    console.log(`Category line: "${categoryLine}"`);
    
    // Skip if this doesn't look like a category line
    if (!categoryLine.includes('Wand,') && 
        !categoryLine.includes('Legacy •') &&
        !categoryLine.includes('Wand, ')) {
        console.log('Not a valid wand category line');
        return null;
    }
    
    currentIndex++; // Move past category line
    
    // Extract rarity from category line
    let rarity = extractRarity(categoryLine);
    
    // Treat Unknown rarity as Rare
    if (rarity === 'Unknown') {
        rarity = 'Rare';
    }
    
    // Extract attunement info
    const attunement = getAttunementInfo(categoryLine);
    
    // Look for class recommendations
    const classRecommendations = extractClassRecommendations(categoryLine);
    
    // Skip price line if present (starts with a number)
    if (currentIndex < lines.length && /^\d/.test(lines[currentIndex])) {
        currentIndex++;
    }
    
    // Extract description (everything until next item or end)
    const description = extractDescription(lines, currentIndex);
    
    // Get price (only add if it exists in price table)
    const price = lookupWandPrice(nameOrTitle, rarity, priceData);
    
    // Determine gacha system based on rarity
    const gachaInfo = getWandGachaInfo(rarity);
    
    const wand = {
        name: nameOrTitle,
        type: "Wand",
        rarity: rarity,
        description: description.trim(),
        where_get: gachaInfo.where_get
    };
    
    // Only add attunement property if it's required
    if (attunement) {
        wand.attunement = attunement;
    }
    
    // Add price (will be 'NA' if not found in price table)
    wand.price = price;
    
    // Only add gacha property if it exists (for research items)
    if (gachaInfo.gacha) {
        wand.gacha = gachaInfo.gacha;
    }
    
    // Add class recommendations only if they exist
    if (classRecommendations.length > 0) {
        wand.class_recommendations = classRecommendations;
    }
    
    console.log(`Created wand: ${wand.name} (${wand.rarity})`);
    return wand;
}

// Extract rarity from category line
function extractRarity(categoryLine) {
    // Order matters! Check longer strings first
    const rarities = ['Very Rare', 'Rare', 'Uncommon', 'Common', 'Legendary', 'Artifact'];
    
    for (const rarity of rarities) {
        if (categoryLine.includes(rarity)) {
            return rarity;
        }
    }
    
    return 'Unknown';
}

// Get attunement info - returns string format for wands
function getAttunementInfo(categoryLine) {
    if (categoryLine.toLowerCase().includes('requires attunement')) {
        return "Requires Attunement";
    }
    return "";
}

// Extract class recommendations from attunement requirements
function extractClassRecommendations(categoryLine) {
    const classRecommendations = [];
    const lowerLine = categoryLine.toLowerCase();
    
    // Check for specific class requirements in attunement
    if (lowerLine.includes('spellcaster')) {
        return ['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Warlock', 'Wizard'];
    }
    
    const classPatterns = [
        { pattern: /\bbard\b/i, class: 'Bard' },
        { pattern: /\bcleric\b/i, class: 'Cleric' },
        { pattern: /\bdruid\b/i, class: 'Druid' },
        { pattern: /\bsorcerer\b/i, class: 'Sorcerer' },
        { pattern: /\bwarlock\b/i, class: 'Warlock' },
        { pattern: /\bwizard\b/i, class: 'Wizard' },
        { pattern: /\bpaladin\b/i, class: 'Paladin' },
        { pattern: /\branger\b/i, class: 'Ranger' }
    ];
    
    classPatterns.forEach(({ pattern, class: className }) => {
        if (pattern.test(categoryLine)) {
            classRecommendations.push(className);
        }
    });
    
    return classRecommendations;
}

// Extract description from lines starting at given index
function extractDescription(lines, startIndex) {
    let description = '';
    let currentIndex = startIndex;
    let inActualDescription = false;
    
    while (currentIndex < lines.length) {
        const line = lines[currentIndex];
        
        // Stop at next item (wand name that's not part of description)
        if (isLikelyNextItem(line)) {
            break;
        }
        
        // Skip metadata lines
        if (line.startsWith('Weight:') || 
            line.startsWith('Cost:') || 
            line.startsWith('Source:') ||
            line.startsWith('Tags:') ||
            line.startsWith('Amount to add') ||
            line === '--' ||
            line === 'Add Item' ||
            line.match(/^[A-Z][a-z]+('s Guide|Master's Guide)/)) {
            currentIndex++;
            continue;
        }
        
        // Skip source references like "BGDIA", "DMG", etc.
        if (line.match(/^[A-Z]{2,}(\s|$)/) && line.length <= 10) {
            currentIndex++;
            continue;
        }
        
        // Skip page references
        if (line.match(/^pg\. \d+/) || line.match(/^p\d+/)) {
            currentIndex++;
            continue;
        }
        
        // Skip numeric lines (like "1", "7", etc.)
        if (line.match(/^\d+$/) && line.length <= 3) {
            currentIndex++;
            continue;
        }
        
        // Check if this is actual item description content
        if (line.includes('This wand') || 
            line.includes('While holding') ||
            line.includes('charges') ||
            line.includes('action') ||
            line.includes('You can use') ||
            line.includes('spellcasting') ||
            inActualDescription) {
            inActualDescription = true;
        }
        
        // Only add to description if we're in actual description content
        if (inActualDescription) {
            if (description.length > 0) {
                description += ' ';
            }
            description += line;
        }
        
        currentIndex++;
    }
    
    // Clean up description - remove common metadata that might have slipped through
    description = description
        .replace(/Weight:\s*--\s*/gi, '')
        .replace(/Cost:\s*--\s*/gi, '')
        .replace(/Source:\s*[^.]*\s*/gi, '')
        .replace(/Tags:\s*[\w\s]*$/gi, '')  // Remove Tags at end of description
        .replace(/\b(Buff|Combat|Social|Utility|Healing|Movement|Damage|Control)\s*/gi, '') // Remove tag words
        .replace(/Amount to add\s*\d+\s*/gi, '')
        .replace(/Add Item\s*/gi, '')
        .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
        .replace(/\s+\./g, '.') // Fix spacing before periods
        .trim();
    
    return description;
}

// Check if a line looks like the start of a new item
function isLikelyNextItem(line) {
    // Skip empty lines
    if (!line || line.trim().length === 0) {
        return false;
    }
    
    // Check for item names (but not description text)
    if (line.includes('Wand') && 
        !line.includes('wand') &&  // lowercase wand usually means description
        !line.includes('holding') &&
        !line.includes('charges') &&
        !line.includes('spell') &&
        !line.includes('action') &&
        !line.includes('expend') &&
        line.length > 3 &&  // Exclude just "Wand"
        line !== 'LegacyWand') {
        return true;
    }
    
    // Check for other item types that might indicate we've moved on
    if (line.includes('Staff') || 
        line.includes('Rod') || 
        line.includes('Armor') ||
        line.includes('Weapon') ||
        (line.includes('Ring') && !line.includes('ring ')) ||
        line.includes('Amulet') ||
        line.includes('Cloak')) {
        return true;
    }
    
    return false;
}

// Get gacha information based on rarity
function getWandGachaInfo(rarity) {
    if (['Rare', 'Very Rare', 'Legendary', 'Artifact'].includes(rarity)) {
        return {
            where_get: "Research",
            gacha: `${rarity} Wand Research`
        };
    }
    
    return {
        where_get: "Magicians Menagerie"
    };
}

// Look up wand price from price table
function lookupWandPrice(wandName, rarity, priceData) {
    // First try exact name match
    if (priceData[wandName]) {
        const priceValue = priceData[wandName];
        return convertPriceToNumber(priceValue);
    }
    
    // Try name variations
    const variations = [
        wandName.replace('Wand of ', ''),  // Remove "Wand of " prefix
        wandName.replace(/^Wand /, ''),    // Remove "Wand " prefix
        wandName.replace(/,/g, ''),        // Remove commas (for "War Mage, +1" -> "War Mage +1")
        wandName.toLowerCase(),
        wandName.toUpperCase()
    ];
    
    for (const variation of variations) {
        if (priceData[variation]) {
            const priceValue = priceData[variation];
            return convertPriceToNumber(priceValue);
        }
    }
    
    // Return 'NA' if not found in price table
    return 'NA';
}

// Convert price string to number
function convertPriceToNumber(priceValue) {
    if (typeof priceValue === 'number') {
        return priceValue;
    }
    
    if (typeof priceValue === 'string') {
        // Remove common currency symbols and text
        const cleanPrice = priceValue
            .replace(/[^0-9,]/g, '') // Remove everything except digits and commas
            .replace(/,/g, '');      // Remove commas
        
        const numPrice = parseInt(cleanPrice, 10);
        return isNaN(numPrice) ? 100 : numPrice;
    }
    
    return 100;
}

// Main execution
if (require.main === module) {
    const wands = parseWandsFromInbound();
    
    if (wands.length > 0) {
        // Write to JSON file
        const outputPath = 'wands.json';
        fs.writeFileSync(outputPath, JSON.stringify(wands, null, 2));
        console.log(`\nWands written to ${outputPath}`);
        
        // Display first few for verification
        console.log('\n=== SAMPLE WANDS ===');
        wands.slice(0, 3).forEach(wand => {
            console.log(`Name: ${wand.name}`);
            console.log(`Rarity: ${wand.rarity}`);
            console.log(`Price: ${wand.price}`);
            console.log(`Attunement: ${wand.attunement || 'None'}`);
            console.log(`Where Get: ${wand.where_get}`);
            console.log(`Gacha: ${wand.gacha || 'None'}`);
            if (wand.class_recommendations) {
                console.log(`Classes: ${wand.class_recommendations.join(', ')}`);
            }
            console.log(`Description: ${wand.description.substring(0, 100)}...`);
            console.log('---');
        });
    } else {
        console.log('No wands found!');
    }
}

module.exports = { parseWandsFromInbound };