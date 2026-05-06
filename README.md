# Minecraft Scene Generator

Generate Minecraft structures (`.schematic` files) using pure JavaScript — no Minecraft mods or editors required.

## How It Works

Schematic files are generated entirely in Node.js and written as binary Sponge v3 format, the same format WorldEdit uses. You can import them directly into your Minecraft world.

## Quick Start

```bash
git clone https://github.com/johrenberger/minecraft-scenes.git
cd minecraft-scenes
npm install
```

## Post Install Instructions

```text
PS E:\coding\minecraft-scenes> node src/presets/dragon-curves.js
🔧 Generating dragon curve (depth 12)...
   Raw path: 8192 points, bounding box...
   Volume: 107 × 13 × 128

Schematic: 107×13×128
Origin: world (0, 1, 0)
  [0] minecraft:air
  [1] minecraft:gray_concrete
  [2] minecraft:gold_block

✅  Saved ./output/dragon-curves.schematic
    Dimensions: 107 × 13 × 128
    Block types: 3
    File size:   228 KB

📁  Open in Minecraft with Litematica → "Load from file"
   Then paste at world coordinates (0, 1, 0)
```

## Generate a Structure

```bash
node src/presets/dragon-curves.js
```

Output: `output/dragon-curves.schematic`

## Import Into Minecraft

**Litematica (Fabric)** — recommended:
1. Install Fabric + Litematica mod: https://www.youtube.com/watch?v=aMZSXAKZzpo
2. Open Litematica → *Place Structures* → *Load from File*
3. Select the `.schematic` file and paste it in your world

**WorldEdit (Fabric):**
1. `/schematic load dragon-curves`
2. `/paste`

**Structure Block (vanilla):**
1. `/give @p structure_block`
2. Place the block, open it → *Load* → select your `.nbt` file

## Project Structure

```
minecraft-scenes/
├── src/
│   ├── SchematicGenerator.js    # Core .schematic binary writer
│   └── presets/
│       └── dragon-curves.js    # Dragon Curve Fractal preset
└── output/
    └── dragon-curves.schematic # Pre-generated structure
```

## Writing New Presets

```javascript
const { SchematicGenerator } = require('../SchematicGenerator.js');

function myScene() {
    const s = new SchematicGenerator(width, height, depth);
    s.setOrigin(0, 1, 0);  // y=1 = just above bedrock layer

    // Place blocks
    for (let x = 0; x < width; x++) {
        for (let z = 0; z < depth; z++) {
            s.setBlock(x, 0, z, 'minecraft:stone');  // floor
        }
    }

    s.save('./output/my-scene.schematic');
}

myScene();
```

Run it: `node src/presets/my-scene.js`

## Schematic Format

- **Type:** Sponge Schematic v3 (WorldEdit)
- **Block storage:** Y-row-major, delta-encoded varints
- **Palette:** Minecraft block IDs (e.g., `minecraft:stone`)
- **Compatible with:** Litematica, WorldEdit, Structure Block, MCEdit

## Available Presets

| Preset | Description | Size |
|--------|-------------|------|
| Dragon Curve | Fractal paper-folding pattern | 107×13×128 |
