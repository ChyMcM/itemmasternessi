import discord
from discord.ext import commands
import json
import random
from discord.ui import Button, View
from discord.ext import tasks

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
async def recommend(ctx, *, class_name: str):
    rarity_order = {
        "common": 1,
        "uncommon": 2,
        "rare": 3,
        "very rare": 4,
        "legendary": 5
    }

    # Match class_recommendations correctly
    matches = [
        item for item in item_data
        if class_name.lower() in [cls.lower() for cls in item.get("class_recommendations", [])]
    ]

    if not matches:
        await ctx.send(f"No item recommendations found for class '{class_name}'.")
        return

    # Sort by rarity, then alphabetically
    matches.sort(
        key=lambda x: (
            rarity_order.get(x.get("rarity", "").lower(), 999),
            x.get("name", "").lower()
        )
    )

    # Prepare item fields
    all_fields = []
    for item in matches:
        name = item.get("name", "Unnamed Item")
        price = item.get("price", "Unknown")
        rarity = item.get("rarity", "Unknown")
        item_type = item.get("type", "Unknown")
        level = item.get("level_restriction")

        value = f"{rarity} {item_type}\nPrice: {price} gp"
        if level:
            value += f"\nLevel Restriction: {level}"

        all_fields.append((name, value))

    # Paginate results (max 25 fields per embed)
    MAX_FIELDS = 25
    chunks = [all_fields[i:i + MAX_FIELDS] for i in range(0, len(all_fields), MAX_FIELDS)]

    for i, chunk in enumerate(chunks):
        embed = discord.Embed(
            title=f"Recommended Items for: {class_name.title()} (Page {i + 1}/{len(chunks)})",
            color=0x2ecc71
        )
        for name, value in chunk:
            embed.add_field(name=name, value=value, inline=False)

        await ctx.send(embed=embed)

@bot.command()
async def type(ctx, type: str, rarity: str = None):
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

class GachaView(View):
    def __init__(self, category, matches):
        super().__init__(timeout=60)  # disables button after 60s
        self.category = category
        self.matches = matches

        reroll_button = Button(label="🔁 Reroll", style=discord.ButtonStyle.blurple)
        reroll_button.callback = self.reroll
        self.add_item(reroll_button)

    async def reroll(self, interaction: discord.Interaction):
        item = random.choice(self.matches)
        embed = build_item_embed(item)
        await interaction.response.edit_message(embed=embed, view=self)

def build_item_embed(item):
    name = item.get("name", "Unnamed Item")
    price = item.get("price", "Unknown")
    item_type = item.get("type", "Unknown")
    rarity = item.get("rarity", "Unknown")
    level = item.get("level_restriction")
    attune = item.get("attunement")
    desc = item.get("description", "No description available.")

    embed = discord.Embed(title=name, color=0x00bcd4)
    embed.add_field(name="Type", value=f"{rarity} {item_type}", inline=True)
    embed.add_field(name="Price", value=f"{price} gp", inline=True)

    if level:
        embed.add_field(name="Level Restriction", value=str(level), inline=True)
    if attune and attune.lower() == "true":
        embed.add_field(name="Attunement", value="Yes", inline=True)

    embed.add_field(name="Description", value=desc, inline=False)
    return embed

@bot.command()
async def gacha(ctx, *, category: str):
    matches = [
        item for item in item_data
        if item.get("gacha", "").lower() == category.lower()
    ]

    if not matches:
        await ctx.send(f"No gacha items found for category '{category}'.")
        return

    item = random.choice(matches)
    embed = build_item_embed(item)
    view = GachaView(category, matches)
    await ctx.send(embed=embed, view=view)

@bot.command(name="nessihelp")
async def help(ctx):
    embed = discord.Embed(
        title="📘 Item Master Nessi Help",
        description="Here's how to use the available commands:",
        color=0x5dade2
    )

    embed.add_field(
        name="`~item <item name>`",
        value="Returns full details about the item with the given name.",
        inline=False
    )

    embed.add_field(
        name="`~type <type> [rarity]`",
        value="Lists all items of a specific type (e.g. Wand, Armor). You can optionally filter by rarity. Results are grouped by rarity and paginated.",
        inline=False
    )

    embed.add_field(
        name="`~location <location>`",
        value="Lists all items available at the given location (e.g. Ironclad Monkey), grouped and sorted by rarity.",
        inline=False
    )

    embed.add_field(
        name="`~rarity <rarity>`",
        value="Lists all items with the specified rarity (e.g. Uncommon), sorted alphabetically. Supports long lists using multiple pages.",
        inline=False
    )

    embed.add_field(
        name="`~recommend <class> <level>`",
        value="Recommends items suitable for a class like Fighter, Wizard, etc. (Custom feature).",
        inline=False
    )

    embed.add_field(
        name="`~gacha <category>`",
        value="Rolls a random item from a gacha category (e.g. Rare Armor, Very Rare Wand). Returns a styled item embed with full info.",
        inline=False
    )

    embed.add_field(
        name="Need more help?",
        value="Ask a staff member or developer for additional categories, custom filters, or new gacha pools.",
        inline=False
    )

    await ctx.send(embed=embed)

@bot.event
async def on_command_error(ctx, error):
    if isinstance(error, commands.MissingRequiredArgument):
        await ctx.send(f"⚠️ Missing argument: `{error.param.name}`.\nUse `~nessihelp` for guidance.")
    
    elif isinstance(error, commands.CommandNotFound):
        await ctx.send("❌ That command doesn't exist. Try `~nessihelp` to see valid commands.")
    
    elif isinstance(error, commands.BadArgument):
        await ctx.send("⚠️ Invalid argument. Please double-check your input.")
    
    elif isinstance(error, commands.CommandInvokeError):
        await ctx.send("😵 Something went wrong running that command. Please check your input or ask staff.")
        raise error  # Optional: log the full traceback for debugging

    else:
        await ctx.send("🚫 An unexpected error occurred.")
        raise error

@bot.event
async def on_ready():
    await bot.change_presence(
        activity=discord.Game(name="~nessihelp for help")
    )
    print(f"Logged in as {bot.user}")

bot.run("my bot key")
