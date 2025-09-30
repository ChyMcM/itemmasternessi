const fs = require('fs');

function parseWeaponsFromInbound() {
    try {
        // Read the inbound.txt file
        const content = fs.readFileSync('inbound.txt', 'utf-8');
        
        // Split content by "Add Item" to get individual weapon entries
        const entries = content.split(/Add Item\s*[\r\n]+/).filter(entry => entry.trim());
        
        const weapons = [];
        
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
            
            // Skip duplicate name lines and "Add" line
            while (i < lines.length && (lines[i].trim() === weapon.name || lines[i].trim() === "Add")) {
                i++;
            }

            // Parse weapon type and rarity from the combined line
            if (i < lines.length) {
                const weaponTypeLine = lines[i++];
                const rarityMatch = weaponTypeLine.match(/Weapon(?:\s*\([^)]+\))?,\s*(Common|Uncommon|Rare|Very Rare|Legendary|Artifact)/i);
                if (rarityMatch) {
                    weapon.rarity = rarityMatch[1];
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

            // Set price
            const priceFromTable = priceTable[weapon.name];
            if (priceFromTable) {
                weapon.price = parseInt(priceFromTable.replace(/[^0-9]/g, '')) || "NA";
            } else {
                weapon.price = "NA";
            }

            // Set weight if available
            if (properties.Weight && properties.Weight !== '--') {
                const weightNum = parseFloat(properties.Weight.replace(/[^0-9.]/g, ''));
                if (!isNaN(weightNum)) {
                    weapon.weight = weightNum;
                }
            }

            // Only add if we have a valid weapon name
            if (weapon.name) {
                weapons.push(weapon);
            }
        }

        return weapons;
    } catch (error) {
        console.error('Error parsing weapons:', error);
        return [];
    }
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
