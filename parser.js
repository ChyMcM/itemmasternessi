const fs = require('fs');

function parseWeaponsFromInbound() {
    try {
        // Read the inbound.txt file
        const content = fs.readFileSync('inbound.txt', 'utf-8');
        
        // Split content by "Add Item" to get individual weapon entries
        const entries = content.split(/Add Item\s*[\r\n]+/).filter(entry => entry.trim());
        
        const weapons = [];
        const enchantmentGroups = new Map(); // Track enchantments and their weapon types
        const weaponTracker = new Map(); // Track weapons to prioritize Legacy versions
        
        // Load price table from external file
        const priceTable = require('./priceTable.json');

        for (let entry of entries) {
            if (!entry.trim()) continue;

            const lines = entry.split(/[\r\n]+/).filter(line => line.trim());
            const weapon = {
                type: "Weapon",
                description: ""
            };

            let i = 0;
            // Get weapon name from first line (clean name only)
            const firstLine = lines[i++]?.trim();
            weapon.name = firstLine;
            
            // Get base weapon type from second line (before "Add" or weapon type line)
            let baseWeaponType = null;
            const secondLine = lines[i]?.trim();
            if (secondLine && secondLine !== 'Add' && !secondLine.startsWith('Weapon') && !secondLine.includes('• Weapon')) {
                baseWeaponType = secondLine;
                i++;
            }
            
            // Skip lines until we find the "Weapon" line with rarity (includes Legacy weapons)
            let weaponTypeLine = null;
            while (i < lines.length) {
                const line = lines[i++].trim();
                if (line.startsWith('Weapon') || line.includes('• Weapon')) {
                    weaponTypeLine = line;
                    break;
                }
            }

            // Parse weapon type and rarity from the weapon line
            if (weaponTypeLine) {
                // Handle both regular and Legacy weapon formats
                const rarityMatch = weaponTypeLine.match(/(?:Legacy\s*•\s*)?Weapon(?:\s*\([^)]+\))?,\s*(Common|Uncommon|Rare|Very Rare|Legendary|Artifact)/i);
                if (rarityMatch) {
                    weapon.rarity = rarityMatch[1];
                } else {
                    weapon.rarity = 'Common';
                }
                
                // Check for attunement requirement
                if (weaponTypeLine.includes('requires attunement')) {
                    weapon.attunement = "Requires Attunement";
                    if (weaponTypeLine.includes('by a')) {
                        const attunementMatch = weaponTypeLine.match(/requires attunement by ([^)]+)\)/);
                        if (attunementMatch) {
                            weapon.attunement = `Requires Attunement by ${attunementMatch[1]}`;
                        }
                    }
                }
            }

            // Parse the remaining properties and build description
            let currentProperty = null;
            let currentValue = '';
            const properties = {};

            for (; i < lines.length; i++) {
                const line = lines[i].trim();
                
                // Skip certain lines
                if (line.match(/^(Amount to add|\d+|Add Item)$/)) {
                    continue;
                }
                
                if (line.endsWith(':')) {
                    // Save previous property
                    if (currentProperty && currentValue.trim()) {
                        properties[currentProperty] = currentValue.trim();
                    }
                    currentProperty = line.replace(':', '');
                    currentValue = '';
                } else if (currentProperty) {
                    if (currentValue) currentValue += ' ';
                    currentValue += line;
                } else if (line && !line.match(/^(Attack Type|Range|Damage|Damage Type|Weight|Cost|Properties|Source|Tags)$/)) {
                    // This is description text
                    if (weapon.description) weapon.description += '\n';
                    weapon.description += line;
                }
            }

            // Process the last property
            if (currentProperty && currentValue.trim()) {
                properties[currentProperty] = currentValue.trim();
            }

            // Build description from properties
            buildWeaponDescription(weapon, properties);

            // Set default values
            if (!weapon.rarity) weapon.rarity = "Common";
            
            // Set where_get based on rarity
            switch(weapon.rarity.toLowerCase()) {
                case 'common':
                    weapon.where_get = "Ironclad Monkey";
                    break;
                case 'uncommon':
                    weapon.where_get = "Magicians Menagerie";
                    break;
                default:
                    weapon.where_get = "Research";
                    weapon.gacha = weapon.rarity + " Weapon Research";
                    break;
            }

            // Set price using smart pattern matching
            weapon.price = lookupWeaponPrice(weapon.name, priceTable);

            // Set weight if available
            if (properties.Weight && properties.Weight !== '--') {
                const weightNum = parseFloat(properties.Weight.replace(/[^0-9.]/g, ''));
                if (!isNaN(weightNum)) {
                    weapon.weight = weightNum;
                }
            }

            // Only add if we have a valid weapon name
            if (weapon.name) {
                // Filter out modern/futuristic weapons not used in the game
                const excludedWeapons = [
                    'Antimatter Rifle', 'Laser Pistol', 'Laser Rifle', 'Pistol', 
                    'Pistol, Automatic', 'Rifle, Automatic', 'Rifle, Hunting', 
                    'Shotgun', 'Energy Cells', 'Modern Bullets',
                    'Bad News (Exandria)', 'Blunderbuss (Exandria)', 'Hand Mortar (Exandria)', 
                    'Musket (Exandria)', 'Pepperbox (Exandria)', 'Pistol (Exandria)', 
                    'Semiautomatic Pistol'
                ];
                
                if (excludedWeapons.includes(weapon.name)) {
                    continue; // Skip this weapon entirely
                }
                
                // Detect if this is a Legacy weapon
                const isLegacy = weaponTypeLine && weaponTypeLine.includes('Legacy •');
                
                // Check if this weapon should be grouped into an enchantment
                const enchantmentInfo = getEnchantmentInfo(weapon.name);
                if (enchantmentInfo) {
                    // Use base weapon type from parsing data, fallback to pattern-extracted type
                    const actualWeaponType = baseWeaponType || enchantmentInfo.weaponType;
                    
                    // Group this weapon by enchantment
                    if (!enchantmentGroups.has(enchantmentInfo.enchantmentName)) {
                        enchantmentGroups.set(enchantmentInfo.enchantmentName, {
                            name: enchantmentInfo.enchantmentName,
                            weaponTypes: new Set(),
                            sampleWeapon: weapon // Use first weapon as template
                        });
                    }
                    enchantmentGroups.get(enchantmentInfo.enchantmentName).weaponTypes.add(actualWeaponType);
                } else {
                    // Regular weapon - check for duplicates and prioritize Legacy versions
                    const existingWeapon = weaponTracker.get(weapon.name);
                    if (existingWeapon) {
                        // If we already have this weapon, only replace if current one is Legacy
                        if (isLegacy && !existingWeapon.isLegacy) {
                            // Replace non-Legacy with Legacy version
                            const index = weapons.findIndex(w => w.name === weapon.name);
                            if (index !== -1) {
                                weapons[index] = weapon;
                                weaponTracker.set(weapon.name, { weapon, isLegacy });
                            }
                        }
                        // If existing is Legacy or current is not Legacy, skip this weapon
                    } else {
                        // New weapon, add it
                        weapons.push(weapon);
                        weaponTracker.set(weapon.name, { weapon, isLegacy });
                    }
                }
            }
        }

        // Create enchantment entries from grouped weapons
        const excludedWeaponTypes = [
            'Antimatter Rifle', 'Laser Pistol', 'Laser Rifle', 'Pistol', 
            'Automatic Pistol', 'Automatic Rifle', 'Hunting Rifle', 
            'Shotgun', 'Energy Cell', 'Modern Bullets',
            'Bad News (Exandria)', 'Blunderbuss (Exandria)', 'Hand Mortar (Exandria)', 
            'Musket (Exandria)', 'Pepperbox (Exandria)', 'Pistol (Exandria)', 
            'Semiautomatic Pistol'
        ];
        
        for (const [enchantmentName, enchantmentData] of enchantmentGroups) {
            // Filter out excluded weapon types from enchantments
            const filteredWeaponTypes = Array.from(enchantmentData.weaponTypes)
                .filter(weaponType => !excludedWeaponTypes.includes(weaponType))
                .sort();
            
            // Only create enchantment if it has remaining weapon types
            if (filteredWeaponTypes.length > 0) {
                const enchantment = {
                    ...enchantmentData.sampleWeapon,
                    name: enchantmentName,
                    weapon_types: filteredWeaponTypes
                };
                weapons.push(enchantment);
            }
        }

        return weapons;
    } catch (error) {
        console.error('Error parsing weapons:', error);
        return [];
    }
}

function getEnchantmentInfo(weaponName) {
    // Define enchantment patterns that should be grouped
    const enchantmentPatterns = [
        { pattern: /^(.+) of Warning$/, enchantmentSuffix: ' Enchantment' },
        { pattern: /^(.+) of Wounding$/, enchantmentSuffix: ' Enchantment' },
        { pattern: /^(.+) of Life Stealing$/, enchantmentSuffix: ' Enchantment' },
        { pattern: /^(.+) of Vengeance$/, enchantmentSuffix: ' Enchantment' },
        { pattern: /^(.+) of Slaying$/, enchantmentSuffix: ' Enchantment' },
        { pattern: /^(.+) of Sharpness$/, enchantmentSuffix: ' Enchantment' },
        { pattern: /^(.+) of Grass$/, enchantmentSuffix: ' Enchantment' },
        { pattern: /^(.+) of the Wood$/, enchantmentSuffix: ' Enchantment' },
        { pattern: /^(.+) of Unity$/, enchantmentSuffix: ' Enchantment' },
        { pattern: /^(.+) of Melodies$/, enchantmentSuffix: ' Enchantment' },
        { pattern: /^(.+?) of Throne's Command(?:\s*\([^)]+\))?$/, enchantmentSuffix: ' Enchantment' },
        { pattern: /^Ruidium (.+)$/, prefix: 'Ruidium', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Dragon Wing (.+)$/, prefix: 'Dragon Wing', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Mind Blade (.+)$/, prefix: 'Mind Blade', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Starcrossed (.+)$/, prefix: 'Starcrossed', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Blade of the Medusa, (.+)$/, prefix: 'Blade of the Medusa', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Comet Smasher (.+)$/, prefix: 'Comet Smasher', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Dancing (.+)$/, prefix: 'Dancing', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Executioner's (.+)$/, prefix: 'Executioner\'s', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Fool's (.+)$/, prefix: 'Fool\'s', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Polymorph Blade, (.+)$/, prefix: 'Polymorph Blade', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Fey (.+)$/, prefix: 'Fey', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Starshot (.+)$/, prefix: 'Starshot', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Bloodshed (.+)$/, prefix: 'Bloodshed', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Scepter (.+)$/, prefix: 'Scepter', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Lunar (.+)$/, prefix: 'Lunar', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Gambler's Blade, (.+)$/, prefix: 'Gambler\'s Blade', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Acheron Blade, (.+)$/, prefix: 'Acheron Blade', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Crystal (.+)$/, prefix: 'Crystal', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Winged (.+)$/, prefix: 'Winged', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Dried Leech, (.+)$/, prefix: 'Dried Leech', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Sylvan Talon (.+)$/, prefix: 'Sylvan Talon', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Berserker (.+)$/, prefix: 'Berserker', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Delerium-Forged (.+)$/, prefix: 'Delerium-Forged', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Quickstep (.+)$/, prefix: 'Quickstep', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Glimmering Moonbow, (.+)$/, prefix: 'Glimmering Moonbow', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Moonsteel (.+)$/, prefix: 'Moonsteel', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Bloodseeker (.+)$/, prefix: 'Bloodseeker', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Frostglow (.+)$/, prefix: 'Frostglow', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Red-Feather (.+)$/, prefix: 'Red-Feather', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Energy (.+)$/, prefix: 'Energy', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Oathbow (.+)$/, prefix: 'Oathbow', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Moon-Touched Sword, (.+)$/, prefix: 'Moon-Touched Sword', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Moon-Touched, (.+)$/, prefix: 'Moon-Touched', enchantmentSuffix: ' Enchantment' },
        { pattern: /^(.+), Walloping$/, prefix: 'Walloping', enchantmentSuffix: ' Enchantment' },
        { pattern: /^True Name (.+), \+1$/, prefix: 'True Name +1', enchantmentSuffix: ' Enchantment' },
        { pattern: /^True Name (.+), \+2$/, prefix: 'True Name +2', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Corpse Slayer, (.+)$/, prefix: 'Corpse Slayer', enchantmentSuffix: ' Enchantment' },
        { pattern: /^(.+), \+(\d+)$/, enchantmentSuffix: ' Enchantment' },
        { pattern: /^Weapon of Certain Death, (.+)$/, prefix: 'Weapon of Certain Death', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Nine Lives Stealer (.+)$/, prefix: 'Nine Lives Stealer', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Flame Tongue (.+)$/, prefix: 'Flame Tongue', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Frost Brand (.+)$/, prefix: 'Frost Brand', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Vicious (.+)$/, prefix: 'Vicious Weapon', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Dragon Slayer (.+)$/, prefix: 'Dragon Slayer', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Giant Slayer (.+)$/, prefix: 'Giant Slayer', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Adamantine (.+)$/, prefix: 'Adamantine', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Silvered (.+)$/, prefix: 'Silvered', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Hellfire (.+)$/, prefix: 'Hellfire', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Enspelled (.+)$/, prefix: 'Enspelled', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Forcebreaker (.+)$/, prefix: 'Forcebreaker', enchantmentSuffix: ' Enchantment' },
        { pattern: /^True Name (.+)$/, prefix: 'True Name', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Armblade \((.+)\)$/, prefix: 'Armblade', enchantmentSuffix: ' Enchantment' },
        { pattern: /^Oceanic (.+)$/, prefix: 'Oceanic', enchantmentSuffix: ' Enchantment' }
    ];

    for (const { pattern, prefix, enchantmentSuffix } of enchantmentPatterns) {
        const match = weaponName.match(pattern);
        if (match) {
            let enchantmentName, weaponType;
            
            if (prefix) {
                // Use predefined prefix (e.g., "Nine Lives Stealer" -> "Nine Lives Stealer Enchantment")
                enchantmentName = prefix + enchantmentSuffix;
                weaponType = match[1];
            } else if (match[2]) {
                // Handle "+X" weapons (e.g., "Battleaxe, +1" -> "Weapon +1 Enchantment")
                enchantmentName = `Weapon +${match[2]}${enchantmentSuffix}`;
                weaponType = match[1];
            } else {
                // Handle "of X" patterns (e.g., "Battleaxe of Warning" -> "Weapon of Warning Enchantment")
                const parts = weaponName.split(' of ');
                if (parts.length === 2) {
                    // Strip optional parenthetical part from enchantment name for consistency
                    const enchantmentPart = parts[1].replace(/\s*\([^)]+\)$/, '');
                    enchantmentName = `Weapon of ${enchantmentPart}${enchantmentSuffix}`;
                    weaponType = parts[0];
                } else {
                    enchantmentName = match[0] + enchantmentSuffix;
                    weaponType = match[1];
                }
            }
            
            return { enchantmentName, weaponType };
        }
    }
    
    return null; // Not an enchantment pattern
}

function lookupWeaponPrice(weaponName, priceTable) {
    // First try exact match
    if (priceTable[weaponName]) {
        return parseInt(priceTable[weaponName].replace(/[^0-9]/g, '')) || "NA";
    }
    
    // Try pattern matching for generic weapon entries
    // Handle "+X" weapons (e.g., "Battleaxe, +1" -> "Weapon +1")
    const plusMatch = weaponName.match(/,\s*\+(\d+)$/);
    if (plusMatch) {
        const genericName = `Weapon +${plusMatch[1]}`;
        if (priceTable[genericName]) {
            return parseInt(priceTable[genericName].replace(/[^0-9]/g, '')) || "NA";
        }
    }
    
    // Handle "of X" weapons (e.g., "Battleaxe of Warning" -> "Weapon of Warning") 
    const ofMatch = weaponName.match(/\s+of\s+(.+)$/);
    if (ofMatch) {
        const genericName = `Weapon of ${ofMatch[1]}`;
        if (priceTable[genericName]) {
            return parseInt(priceTable[genericName].replace(/[^0-9]/g, '')) || "NA";
        }
    }
    
    // Handle prefix patterns (e.g., "Nine Lives Stealer Battleaxe" -> "Nine Lives Stealer")
    for (const priceKey in priceTable) {
        if (weaponName.startsWith(priceKey + " ")) {
            return parseInt(priceTable[priceKey].replace(/[^0-9]/g, '')) || "NA";
        }
    }
    
    // Handle special "Vicious" case: "Vicious Battleaxe" -> "Vicious Weapon"
    if (weaponName.startsWith("Vicious ") && priceTable["Vicious Weapon"]) {
        return parseInt(priceTable["Vicious Weapon"].replace(/[^0-9]/g, '')) || "NA";
    }
    
    // Handle other patterns like "Dragon's Wrath", "Adamantine", etc.
    // Check if the priceTable has a generic version
    const weaponParts = weaponName.split(/[\s,]+/);
    for (const part of weaponParts) {
        if (part.length > 2) { // Skip short words
            const genericName = `Weapon ${part}`;
            if (priceTable[genericName]) {
                return parseInt(priceTable[genericName].replace(/[^0-9]/g, '')) || "NA";
            }
        }
    }
    
    return "NA";
}

function buildWeaponDescription(weapon, properties) {
    let description = [];
    
    // Start with weapon type
    const attackType = properties['Attack Type'];
    if (attackType) {
        description.push(`${attackType} weapon`);
    } else {
        description.push('Weapon');
    }
    
    // Add any existing description content
    if (weapon.description && weapon.description.trim()) {
        description.push('');
        description.push(weapon.description.trim());
    }
    
    // Add damage information
    if (properties.Damage) {
        description.push('');
        description.push(`Damage: ${properties.Damage}`);
    }
    
    if (properties['Damage Type']) {
        description.push(`Damage Type: ${properties['Damage Type'].trim()}`);
    }
    
    // Add range if it's a ranged weapon
    if (properties.Range) {
        description.push(`Range: ${properties.Range}`);
    }
    
    // Add properties
    if (properties.Properties) {
        description.push(`Properties: ${properties.Properties}`);
    }
    
    // Add weight
    if (properties.Weight && properties.Weight !== '--') {
        description.push(`Weight: ${properties.Weight}`);
    }
    
    // Add source
    if (properties.Source) {
        description.push('');
        description.push(`Source: ${properties.Source}`);
    }
    
    weapon.description = description.join('\n');
}

// Main execution
console.log('Parsing weapons from inbound.txt...');
const weapons = parseWeaponsFromInbound();

if (weapons.length > 0) {
    // Write to weapons.json
    fs.writeFileSync('weapons.json', JSON.stringify(weapons, null, 2), 'utf-8');
    console.log(`Successfully parsed ${weapons.length} weapons and wrote to weapons.json`);
    
    // Show first few weapons as preview
    console.log('\\nFirst few weapons:');
    weapons.slice(0, 3).forEach((weapon, index) => {
        console.log(`${index + 1}. ${weapon.name} (${weapon.rarity}) - ${weapon.where_get}`);
    });
} else {
    console.log('No weapons were parsed. Check the input format.');
}
