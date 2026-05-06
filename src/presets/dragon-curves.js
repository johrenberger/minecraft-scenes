/**
 * Dragon Curve Fractal — Minecraft Schematic Generator
 *
 * The Heighway dragon is a space-filling fractal curve first described by
 * NASA physicists John Conway and Bill Heighway. Despite its seemingly complex
 * pattern, it never crosses itself and fills a surprisingly compact region.
 *
 * This generator creates a 3D dragon curve with configurable depth, height,
 * and block materials. Each "turn" in the curve is marked with a gold block;
 * the body uses the selected material (wool, glass, etc.)
 *
 * Import: Litematica → Load from file
 * Then paste at y=1 in your Minecraft world.
 */
const { SchematicGenerator } = require('../SchematicGenerator.js');

// --- Configuration ---
const ITERATION_DEPTH = 12;        // 2^12 = 4,096 segments (good for ~100×100 area)
const CURVE_MATERIAL = 'minecraft:gray_concrete';
const CORNER_MATERIAL = 'minecraft:gold_block';
const BASE_MATERIAL   = 'minecraft:stone';
const BORDER_MATERIAL = 'minecraft:dark_oak_planks';
const WIDTH  = 120;   // X extent
const HEIGHT = 12;   // max Y height for the wave
const LENGTH = 120;   // Z extent

// --- Dragon Curve Algorithm ---
/**
 * Generate the dragon curve path as an array of {x,y,z} points.
 * Uses the fold-and-turn iterative algorithm:
 *   - Start with turns = [1]
 *   - Each iteration: reverse turns, flip 0↔1, append 1 at end
 */
function generateDragonPoints(depth) {
    let turns = [1]; // 1 = right turn, 0 = left turn

    for (let d = 0; d < depth; d++) {
        const reversed = [...turns].reverse().map(t => 1 - t);
        turns = [...turns, 1, ...reversed];
    }

    // Convert turn sequence to direction sequence
    // Directions: 0=+x, 1=+z, 2=-x, 3=-z (clockwise)
    const dirs = [[1,0], [0,1], [-1,0], [0,-1]]; // dx, dz pairs
    let dir = 0; // start facing +x

    // Build path with per-segment heights using a wave
    const points = [{x: 0, z: 0, dir: 0}]; // start at origin
    let cx = 0, cz = 0;

    for (const t of turns) {
        dir = (dir + (t === 1 ? 1 : -1) + 4) % 4;
        cx += dirs[dir][0];
        cz += dirs[dir][1];
        points.push({ x: cx, z: cz, dir });
    }

    return points;
}

/**
 * Compute bounding box of the path, then normalize to start at (0,0,0).
 */
function normalizePoints(points) {
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }

    const ox = -minX;
    const oz = -minZ;

    return points.map(p => ({ x: p.x + ox, z: p.z + oz }));
}

/**
 * Build the Minecraft schematic.
 */
function buildDragonCurve() {
    console.log(`🔧 Generating dragon curve (depth ${ITERATION_DEPTH})...`);
    const raw = generateDragonPoints(ITERATION_DEPTH);
    console.log(`   Raw path: ${raw.length} points, bounding box...`);

    const pts = normalizePoints(raw);

    // Determine actual bounding box
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }

    const dims = { w: maxX - minX + 1, h: HEIGHT + 1, l: maxZ - minZ + 1 };
    console.log(`   Volume: ${dims.w} × ${dims.h} × ${dims.l}`);

    const schem = new SchematicGenerator(dims.w, dims.h, dims.l);
    schem.setOrigin(minX, 1, minZ);

    // --- Height function: wave along the path ---
    const totalSteps = pts.length - 1;

    for (let i = 0; i < pts.length; i++) {
        const { x, z } = pts[i];
        // Wave height: sine wave with some noise-like variation
        const t = i / totalSteps;
        const baseH = Math.round(HEIGHT * (
            0.5 * Math.sin(t * Math.PI * 6) +
            0.3 * Math.sin(t * Math.PI * 11) +
            0.15 * Math.sin(t * Math.PI * 17)
        ));
        const h = Math.max(1, Math.min(HEIGHT - 1, baseH + Math.round(HEIGHT / 2)));

        // Place a column of blocks for this curve segment
        for (let y = 0; y < h; y++) {
            const mat = y === h - 1 ? CORNER_MATERIAL : CURVE_MATERIAL;
            schem.setBlock(x, y, z, mat);
        }

        // Also fill downward to base height for a solid pillar
        for (let y = 0; y < h; y++) {
            schem.setBlock(x, y, z, CURVE_MATERIAL);
        }
        // Top: gold
        schem.setBlock(x, h, z, CORNER_MATERIAL);
    }

    // --- Add a base plane ---
    for (let z = 0; z < dims.l; z++) {
        for (let x = 0; x < dims.w; x++) {
            schem.setBlock(x, 0, z, BASE_MATERIAL);
        }
    }

    // --- Add border around the perimeter ---
    const pad = 1;
    const borderX1 = minX - pad, borderX2 = maxX + pad;
    const borderZ1 = minZ - pad, borderZ2 = maxZ + pad;
    const borderL = dims.l + pad * 2;
    const borderH = 3;

    for (let y = 1; y <= borderH; y++) {
        // Bottom layer of border: filled
        for (let z = borderZ1; z <= borderZ2; z++) {
            for (let x = borderX1; x <= borderX2; x++) {
                const onEdge = (x === borderX1 || x === borderX2 || z === borderZ1 || z === borderZ2);
                if (onEdge) {
                    schem.setBlock(x, y, z, y < borderH ? BORDER_MATERIAL : 'minecraft:cobblestone');
                }
            }
        }
    }

    return schem;
}

// --- Run ---
const schem = buildDragonCurve();
schem.describe();

const outputPath = './output/dragon-curves.schematic';
schem.save(outputPath);
console.log('\n📁  Open in Minecraft with Litematica → "Load from file"');
console.log(`   Then paste at world coordinates (${schem.origin.x}, ${schem.origin.y}, ${schem.origin.z})`);
