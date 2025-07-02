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
async def type(ctx, *, item_type: str):
    matches = [item for item in item_data if item.get("type", "").lower() == item_type.lower()]
    
    if not matches:
        await ctx.send(f"No items of type '{item_type}' found.")
        return

    embed = discord.Embed(
        title=f"Items of Type: {item_type.title()}",
        color=0x4fc3f7
    )

    for item in matches:
        name = item["name"]
        price = item.get("price", "Unknown")
        embed.add_field(name=name, value=f"{price} gp", inline=False)

    await ctx.send(embed=embed)

@bot.command()
async def location(ctx, *, location: str):
    matches = [
        item for item in item_data
        if item.get("where_get", "").lower() == location.lower()
    ]
    
    if not matches:
        await ctx.send(f"No items found at '{location}'.")
        return

    embed = discord.Embed(
        title=f"Items Found at: {location.title()}",
        color=0x9b59b6
    )

    for item in matches:
        name = item["name"]
        price = item.get("price", "Unknown")
        level = item.get("level_restriction")

        value = f"Price: {price} gp"
        if level:
            value += f"\nLevel Restriction: {level}"

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

    embed = discord.Embed(
        title=f"Items with Rarity: {rarity.title()}",
        color=0xf1c40f  
    )

    for item in matches:
        name = item["name"]
        price = item.get("price", "Unknown")
        level = item.get("level_restriction")

        value = f"Price: {price} gp"
        if level:
            value += f"\nLevel Restriction: {level}"

        embed.add_field(name=name, value=value, inline=False)

    await ctx.send(embed=embed)

bot.run("my bot key")
