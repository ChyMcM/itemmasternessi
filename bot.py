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
    if item.get("class_recommendations"):
        embed.add_field(name="Recommended Classes", value=", ".join(item["class_recommendations"]), inline=False)
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

bot.run("my bot key")
