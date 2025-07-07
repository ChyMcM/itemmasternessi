import discord
from discord.ext import commands
import json

with open("items.json", "r") as f:
    item_data = json.load(f)

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="~", intents=intents)

@bot.event
async def on_ready():
    print(f"Logged in as {bot.user}")

@bot.command()
async def ping(ctx):
    await ctx.send("Pong! Nessi is online.")

@bot.command()
async def item(ctx, *, item_name: str):
    item = next((i for i in item_data if item_name.lower() in i["name"].lower()), None)
    if not item:
        await ctx.send("Item not found.")
        return

    embed = discord.Embed(title=item["name"], description=f"Type: {item['type']}", color=0x4fc3f7)
    embed.add_field(name="Price", value=f"{item['price']} gp", inline=True)
    embed.add_field(name="Rarity", value=item["rarity"], inline=True)
    embed.add_field(name="Where to Find", value=item["where_get"], inline=True)
    if item.get("class_recommendations"):
        embed.add_field(name="Recommended Classes", value=", ".join(item["class_recommendations"]), inline=False)
    if item.get("level_restriction"):
        embed.add_field(name="Level Requirement", value=f"Level {item['level_restriction']}", inline=True)
    if item.get("attunement"):
        embed.add_field(name="Attunement", value=item["attunement"], inline=True)
    embed.add_field(name="Description", value=item["description"], inline=True)
    await ctx.send(embed=embed)

@bot.command()
async def recommend(ctx, class_name: str, level: int):
    matches = [
        item for item in item_data
        if class_name.lower() in [c.lower() for c in item["class_recommendations"]]
        and item["level_restriction"] <= level
    ]

    if not matches:
        await ctx.send("No recommended items found.")
        return

    embed = discord.Embed(title=f"Recommended for {class_name.title()} (Level {level}+)", color=0x8e44ad)
    for item in matches[:5]:
        embed.add_field(name=item["name"], value=f"{item['type']} - {item['price']} gp", inline=False)
    await ctx.send(embed=embed)

@bot.command()
async def itemsbytype(ctx, type: str, rarity: str = None):
    rarity_order = {
        "common": 1,
        "uncommon": 2,
        "rare": 3,
        "very rare": 4,
        "legendary": 5
    }

    matches = [
        item for item in item_data
        if item.get("type", "").lower() == type.lower()
        and (rarity is None or item.get("rarity", "").lower() == rarity.lower())
    ]

    if not matches:
        message = f"No items of type '{type}'"
        if rarity:
            message += f" with rarity '{rarity}'"
        await ctx.send(message + ".")
        return

    # Build title
    embed_title = f"{type.title()}s"
    if rarity:
        embed_title += f" (Rarity: {rarity.title()})"

    # Build output fields
    all_fields = []

    if rarity:  # If filtering by rarity, skip grouping
        sorted_items = sorted(matches, key=lambda x: x.get("name", "").lower())
        for item in sorted_items:
            name = item["name"]
            price = item.get("price", "Unknown")
            level = item.get("level_restriction")
            value = f"Price: {price} gp"
            if level:
                value += f"\nLevel Restriction: {level}"
            all_fields.append((name, value))
    else:
        # Group and sort by rarity, then by name
        grouped = {}
        for item in matches:
            item_rarity = item.get("rarity", "Unknown").title()
            grouped.setdefault(item_rarity, []).append(item)

        sorted_rarities = sorted(
            grouped.keys(),
            key=lambda r: rarity_order.get(r.lower(), 999)
        )

        for item_rarity in sorted_rarities:
            all_fields.append(("**" + item_rarity + "**", "\u200b"))  # Group label

            sorted_items = sorted(grouped[item_rarity], key=lambda x: x.get("name", "").lower())
            for item in sorted_items:
                name = item["name"]
                price = item.get("price", "Unknown")
                level = item.get("level_restriction")
                value = f"Price: {price} gp"
                if level:
                    value += f"\nLevel Restriction: {level}"
                all_fields.append((name, value))

    # Split into pages of max 25 fields
    MAX_FIELDS = 25
    field_chunks = [all_fields[i:i + MAX_FIELDS] for i in range(0, len(all_fields), MAX_FIELDS)]

    for i, chunk in enumerate(field_chunks):
        embed = discord.Embed(
            title=f"Items of Type: {embed_title} (Page {i + 1}/{len(field_chunks)})",
            color=0x4fc3f7
        )
        for name, value in chunk:
            embed.add_field(name=name, value=value, inline=False)
        await ctx.send(embed=embed)

@bot.command()
async def location(ctx, *, location: str):
    rarity_order = {
        "common": 1,
        "uncommon": 2,
        "rare": 3,
        "very rare": 4,
        "legendary": 5
    }

    matches = [
        item for item in item_data
        if item.get("where_get", "").lower() == location.lower()
    ]
    
    if not matches:
        await ctx.send(f"No items found at '{location}'.")
        return

    # Group by rarity
    grouped = {}
    for item in matches:
        rarity = item.get("rarity", "Unknown").title()
        grouped.setdefault(rarity, []).append(item)

    # Sort the rarity groups by rarity level
    sorted_rarities = sorted(
        grouped.keys(),
        key=lambda r: rarity_order.get(r.lower(), 999)
    )

    # Build all fields first
    all_fields = []
    for rarity in sorted_rarities:
        all_fields.append(("**" + rarity + "**", "\u200b"))  # Rarity header

        sorted_items = sorted(grouped[rarity], key=lambda x: x.get("name", "").lower())
        for item in sorted_items:
            name = item["name"]
            price = item.get("price", "Unknown")
            level = item.get("level_restriction")
            value = f"Price: {price} gp"
            if level:
                value += f"\nLevel Restriction: {level}"
            all_fields.append((name, value))

    # Split into chunks of 25 fields per embed
    MAX_FIELDS = 25
    field_chunks = [all_fields[i:i + MAX_FIELDS] for i in range(0, len(all_fields), MAX_FIELDS)]

    for i, chunk in enumerate(field_chunks):
        embed = discord.Embed(
            title=f"Items Found at: {location.title()} (Page {i + 1}/{len(field_chunks)})",
            color=0x9b59b6
        )
        for name, value in chunk:
            embed.add_field(name=name, value=value, inline=False)
        await ctx.send(embed=embed)

@bot.command()
async def rarity(ctx, *, rarity: str):
    matches = [
        item for item in item_data
        if item.get("rarity", "").lower() == rarity.lower()
    ]

    if not matches:
        await ctx.send(f"No items found with rarity '{rarity}'.")
        return

    # Sort alphabetically
    matches.sort(key=lambda x: x.get("name", "").lower())

    # Create multiple embeds if needed
    MAX_FIELDS = 25
    chunks = [matches[i:i + MAX_FIELDS] for i in range(0, len(matches), MAX_FIELDS)]

    for index, chunk in enumerate(chunks):
        embed = discord.Embed(
            title=f"Items with Rarity: {rarity.title()} (Page {index + 1}/{len(chunks)})",
            color=0xf1c40f
        )

        for item in chunk:
            name = item["name"]
            price = item.get("price", "Unknown")
            level = item.get("level_restriction")

            value = f"Price: {price} gp"
            if level:
                value += f"\nLevel Restriction: {level}"

            embed.add_field(name=name, value=value, inline=False)

        await ctx.send(embed=embed)

bot.run("my bot key")
