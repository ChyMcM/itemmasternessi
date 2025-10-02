const fs = require('fs');

function parseStaffsFromInbound() {
    try {
        const inboundData = fs.readFileSync('inbound.txt', 'utf8');
        const lines = inboundData.split('\n').map(line => line.trim());
        
        const staffs = [];
        const staffTracker = new Map(); // Track staffs to handle duplicates and Legacy versions
        
        for (let i = 0; i < lines.length - 5; i++) {
            const staffName = lines[i];
            const baseStaffType = lines[i + 1];
            const addLine = lines[i + 2];
            const categoryLine = lines[i + 3];
            
            // Skip if this doesn't look like a staff entry
            if (addLine !== 'Add' || !categoryLine.includes('Staff')) {
                continue;
            }
            
            // Extract rarity from category line (e.g., "Rod, Uncommon" -> "Uncommon")
            const rarity = extractRarity(categoryLine);
            if (!rarity) continue;
            
            // Check if this is a Legacy item
            const isLegacy = categoryLine.includes('Legacy');
            
            // Look up price from price table
            const price = lookupStaffPrice(staffName, rarity);
            
            const staff = {
                name: staffName,
                type: "Staff",
                price: price,
                rarity: rarity
            };
            
            // Set where_get and gacha based on rarity
            if (rarity === 'Rare' || rarity === 'Very Rare' || rarity === 'Legendary') {
                staff.where_get = "Research";
                staff.gacha = `${rarity} Staff Research`;
            } else {
                staff.where_get = "Magicians Menagerie";
            }
            
            // Handle attunement requirements
            const attunementInfo = getAttunementInfo(categoryLine);
            if (attunementInfo.requiresAttunement) {
                staff.attunement = "Requires Attunement";
                // Only add class recommendations if specific classes are required
                if (attunementInfo.specificClasses.length > 0) {
                    staff.class_recommendations = attunementInfo.specificClasses;
                }
            }
            
            // Add description if available
            const description = extractDescription(lines, i + 4);
            if (description) {
                staff.description = description;
            }
            
            // Check for duplicates and prioritize Legacy versions
            const existingStaff = staffTracker.get(staff.name);
            if (existingStaff) {
                // If we already have this staff, only replace if current one is Legacy
                if (isLegacy && !existingStaff.isLegacy) {
                    // Replace non-Legacy with Legacy version
                    const index = staffs.findIndex(s => s.name === staff.name);
                    if (index !== -1) {
                        staffs[index] = staff;
                        staffTracker.set(staff.name, { ...staff, isLegacy: true });
                    }
                }
                // Otherwise skip this duplicate
            } else {
                // New staff, add it
                staffs.push(staff);
                staffTracker.set(staff.name, { ...staff, isLegacy });
            }
        }
        
        return staffs;
    } catch (error) {
        console.error('Error parsing staffs:', error);
        return [];
    }
}



function extractRarity(categoryLine) {
    // Check longer strings first to avoid "Rare" matching before "Very Rare"
    const rarities = ['Very Rare', 'Legendary', 'Uncommon', 'Common', 'Rare'];
    for (const rarity of rarities) {
        if (categoryLine.includes(rarity)) {
            return rarity;
        }
    }
    return null;
}

function lookupStaffPrice(staffName, rarity) {
    // Default pricing based on rarity
    const defaultPrices = {
        'Common': 50,
        'Uncommon': 200,
        'Rare': 2000,
        'Very Rare': 8000,
        'Legendary': 25000
    };
    
    // Load price table if it exists
    try {
        const priceTable = JSON.parse(fs.readFileSync('priceTable.json', 'utf8'));
        if (priceTable[staffName]) {
            // Convert string price to number (e.g., "200 gp" -> 200)
            const priceStr = priceTable[staffName];
            if (typeof priceStr === 'string') {
                const numericPrice = parseInt(priceStr.replace(/[^0-9]/g, ''));
                return isNaN(numericPrice) ? defaultPrices[rarity] || 50 : numericPrice;
            }
            return priceTable[staffName];
        }
    } catch (error) {
        // Price table doesn't exist or staff not found, use default pricing
    }
    
    return defaultPrices[rarity] || 50;
}

function getAttunementInfo(categoryLine) {
    const requiresAttunement = categoryLine.includes('requires attunement');
    const specificClasses = [];
    
    if (requiresAttunement) {
        // Extract specific class requirements (case-insensitive)
        const lowerCategoryLine = categoryLine.toLowerCase();
        
        if (lowerCategoryLine.includes('warlock')) {
            specificClasses.push('warlock');
        }
        if (lowerCategoryLine.includes('cleric')) {
            specificClasses.push('cleric');
        }
        if (lowerCategoryLine.includes('druid')) {
            specificClasses.push('druid');
        }
        if (lowerCategoryLine.includes('wizard')) {
            specificClasses.push('wizard');
        }
        if (lowerCategoryLine.includes('sorcerer')) {
            specificClasses.push('sorcerer');
        }
        if (lowerCategoryLine.includes('bard')) {
            specificClasses.push('bard');
        }
        
        // Note: "spellcaster" is generic, so we don't add specific classes for it
    }
    
    return {
        requiresAttunement: requiresAttunement,
        specificClasses: specificClasses
    };
}

function extractDescription(lines, startIndex) {
    let description = '';
    let currentIndex = startIndex;
    
    // Skip weight, cost, source section
    while (currentIndex < lines.length && 
           (lines[currentIndex].includes('Weight:') || 
            lines[currentIndex].includes('Cost:') || 
            lines[currentIndex].includes('Source:') ||
            lines[currentIndex] === '--' ||
            lines[currentIndex] === '')) {
        currentIndex++;
    }
    
    // Skip the actual source reference line (various formats)
    if (currentIndex < lines.length && 
        (lines[currentIndex].includes(', pg.') || 
         lines[currentIndex].includes('Guide to ') ||
         lines[currentIndex].includes('Manual') ||
         lines[currentIndex].includes('Handbook'))) {
        currentIndex++;
        // Skip any blank line after source
        if (currentIndex < lines.length && lines[currentIndex] === '') {
            currentIndex++;
        }
    }
    
    // Collect description lines until we hit certain stop conditions
    while (currentIndex < lines.length) {
        const line = lines[currentIndex];
        
        // Stop conditions - various ways items end
        if (line === 'Tags:' || 
            line === 'Amount to add' ||
            line === 'Add Item' ||
            (line && lines[currentIndex + 1] && lines[currentIndex + 2] === 'Add')) {
            break;
        }
        
        // Add valid description text (allow blank lines within descriptions)
        if (line.trim()) {
            if (description) description += ' ';
            description += line;
        }
        
        currentIndex++;
        
        // Stop after reasonable length to avoid pulling in next items
        if (description.length > 1500) break;
    }
    
    return description.trim();
}

// Main execution
console.log('Parsing staffs from inbound.txt...');
const staffs = parseStaffsFromInbound();

// Write to file
fs.writeFileSync('staffs.json', JSON.stringify(staffs, null, 2));
console.log(`Successfully parsed ${staffs.length} staffs and wrote to staffs.json`);

// Show first few staffs as preview
console.log('\nFirst few staffs:');
for (let i = 0; i < Math.min(3, staffs.length); i++) {
    const staff = staffs[i];
    console.log(`${i + 1}. ${staff.name} (${staff.rarity}) - ${staff.where_get}`);
}