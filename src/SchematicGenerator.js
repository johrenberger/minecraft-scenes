/**
 * SchematicGenerator — creates Minecraft .schematic (WorldEdit Sponge v3) files
 *
 * Format spec: https://minecraft.fandom.com/wiki/Schematic_file_format
 * Sponge v3 (WorldEdit): most widely compatible schematic format
 *
 * Block storage: Y-row-major (Minecraft chunk order)
 *   index = y * (width × length) + z * width + x
 *
 * Import into Minecraft:
 *   Litematica (Fabric): Place Structures → Load from file → paste at y=1
 *   WorldEdit (Fabric):  //schematic load <filename>
 *   Structure Block:     /give @p structure_block → load the .nbt file
 */
const { writeFileSync } = require('fs');

// ---- Minecraft NBT binary encoding ----

const TAG = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12 };

function utf8(str) {
    return Buffer.from(str, 'utf8');
}

/** Encode a Minecraft VarInt (LE base-128, max 5 bytes). */
function varInt(value) {
    const result = [];
    let v = value >>> 0;
    while (v > 0x7f) {
        result.push((v & 0x7f) | 0x80);
        v >>>= 7;
    }
    result.push(v & 0x7f);
    return Buffer.from(result);
}

/** Encode a signed 32-bit integer (zigzag → varint). */
function zigzag(value) {
    return varInt(((value << 1) ^ (value >> 31)) >>> 0);
}

/** Write NBT tag header: type byte + (optional) name. */
function writeTagHeader(buf, type, name) {
    buf.push(Buffer.from([type]));
    if (name !== null && name !== undefined) {
        const nameBytes = utf8(name);
        buf.push(Buffer.from([(nameBytes.length >> 8) & 0xff, nameBytes.length & 0xff]));
        buf.push(nameBytes);
    }
}

/** Write NBT primitives into a buffer array. */
function writeByte(buf, v)  { buf.push(Buffer.from([v & 0xff])); }
function writeShort(buf, v) { buf.push(Buffer.alloc(2)); buf.push(Buffer.from([(v >> 8) & 0xff, v & 0xff])); }
function writeInt(buf, v)   { buf.push(Buffer.from([(v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff])); }
function writeLong(buf, v)  { buf.push(Buffer.alloc(8)); /* placeholder */ }

function writeFloat(buf, v) {
    const b = Buffer.alloc(4);
    b.writeFloatBE(v, 0);
    buf.push(b);
}

function writeDouble(buf, v) {
    const b = Buffer.alloc(8);
    b.writeDoubleBE(v, 0);
    buf.push(b);
}

function writeString(buf, s) {
    const bytes = utf8(s);
    writeShort(buf, bytes.length);
    buf.push(bytes);
}

function writeByteArray(buf, arr) {
    writeInt(buf, arr.length);
    buf.push(Buffer.from(arr));
}

function writeIntArray(buf, arr) {
    writeInt(buf, arr.length);
    for (const v of arr) writeInt(buf, v);
}

function writeLongArray(buf, arr) {
    writeInt(buf, arr.length);
    for (const v of arr) writeLong(buf, v);
}

function writeList(buf, itemType, items) {
    writeByte(buf, itemType);
    writeInt(buf, items.length);
    for (const item of items) {
        // Caller handles each item encoding
    }
}

function writeCompound(buf, obj, endCb) {
    for (const [key, val] of Object.entries(obj)) {
        if (val === null || val === undefined) continue;
        if (typeof val === 'object' && val.__tag) {
            // Tagged value: { __tag: TAG.XXX, __val: ... }
            writeTagHeader(buf, val.__tag, key);
            const encoded = encodeNBT(val.__val, val.__tag);
            buf.push(encoded);
        } else if (typeof val === 'object' && !Array.isArray(val)) {
            writeTagHeader(buf, TAG.COMPOUND, key);
            writeCompound(buf, val);
        } else if (Array.isArray(val)) {
            if (val.length === 0) {
                writeTagHeader(buf, TAG.BYTE_ARRAY, key);
                writeInt(buf, 0);
            } else if (typeof val[0] === 'number') {
                if (Number.isInteger(val[0]) && Math.abs(val[0]) <= 127) {
                    writeTagHeader(buf, TAG.BYTE_ARRAY, key);
                    writeByteArray(buf, val);
                } else if (Number.isInteger(val[0])) {
                    writeTagHeader(buf, TAG.INT_ARRAY, key);
                    writeIntArray(buf, val);
                } else {
                    writeTagHeader(buf, TAG.LONG_ARRAY, key);
                    writeLongArray(buf, val);
                }
            }
        } else if (typeof val === 'string') {
            writeTagHeader(buf, TAG.STRING, key);
            writeString(buf, val);
        } else if (typeof val === 'number') {
            if (Number.isInteger(val)) {
                if (val >= -128 && val <= 127) {
                    writeTagHeader(buf, TAG.BYTE, key);
                    writeByte(buf, val);
                } else if (val >= -32768 && val <= 32767) {
                    writeTagHeader(buf, TAG.SHORT, key);
                    writeShort(buf, val);
                } else {
                    writeTagHeader(buf, TAG.INT, key);
                    writeInt(buf, val);
                }
            } else {
                writeTagHeader(buf, TAG.FLOAT, key);
                writeFloat(buf, val);
            }
        } else if (typeof val === 'boolean') {
            writeTagHeader(buf, TAG.BYTE, key);
            writeByte(buf, val ? 1 : 0);
        }
    }
    buf.push(Buffer.from([TAG.END]));
}

/** Top-level encode for a value (no tag byte, used inside compounds). */
function encodeNBT(value, tagType) {
    const buf = [];
    switch (tagType) {
        case TAG.BYTE:       writeByte(buf, value);    break;
        case TAG.SHORT:      writeShort(buf, value);   break;
        case TAG.INT:       writeInt(buf, value);      break;
        case TAG.LONG:      writeLong(buf, value);     break;
        case TAG.FLOAT:     writeFloat(buf, value);    break;
        case TAG.DOUBLE:    writeDouble(buf, value);   break;
        case TAG.BYTE_ARRAY: writeByteArray(buf, value); break;
        case TAG.INT_ARRAY:  writeIntArray(buf, value);  break;
        case TAG.LONG_ARRAY: writeLongArray(buf, value); break;
        case TAG.STRING:     writeString(buf, value);   break;
        case TAG.LIST:      /* handled separately */   break;
        case TAG.COMPOUND:  writeCompound(buf, value);  break;
    }
    return Buffer.concat(buf);
}

// ---- SchematicGenerator ----

class SchematicGenerator {
    /**
     * @param {number} width   X dimension (blocks)
     * @param {number} height  Y dimension (blocks)
     * @param {number} length  Z dimension (blocks)
     */
    constructor(width, height, length) {
        this.width  = width;
        this.height = height;
        this.length = length;
        this.blocks = new Uint8Array(width * height * length);
        this.palette = new Map();
        this.paletteIndex = 0;
        this.origin = { x: 0, y: 1, z: 0 };

        this.blocks.fill(0);
        this.palette.set('minecraft:air', 0);
        this.paletteIndex = 1;
    }

    /** Set block at world coordinate (x,y,z). Out-of-bounds → silently ignored. */
    setBlock(x, y, z, blockName) {
        x -= this.origin.x;
        y -= this.origin.y;
        z -= this.origin.z;

        if (x < 0 || x >= this.width || y < 0 || y >= this.height || z < 0 || z >= this.length) return;

        if (!this.palette.has(blockName)) {
            this.palette.set(blockName, this.paletteIndex++);
        }

        const idx = y * (this.width * this.length) + z * this.width + x;
        this.blocks[idx] = this.palette.get(blockName);
    }

    /** Get block name at world coordinate. Returns null if out of bounds. */
    getBlock(x, y, z) {
        x -= this.origin.x; y -= this.origin.y; z -= this.origin.z;
        if (x < 0 || x >= this.width || y < 0 || y >= this.height || z < 0 || z >= this.length) return null;
        const idx = y * (this.width * this.length) + z * this.width + x;
        const pIdx = this.blocks[idx];
        for (const [name, i] of this.palette.entries()) {
            if (i === pIdx) return name;
        }
        return 'minecraft:air';
    }

    /** Set where (0,0,0) in the schematic maps to in world coordinates. */
    setOrigin(x, y, z) { this.origin = { x, y, z }; }

    /** Fill a rectangular region with a single block type. */
    fill(x1, y1, z1, x2, y2, z2, blockName) {
        const [minX,, minZ] = [Math.min(x1,x2), Math.min(y1,y2), Math.min(z1,z2)];
        const [maxX,, maxZ] = [Math.max(x1,x2), Math.max(y1,y2), Math.max(z1,z2)];
        for (let y = minY; y <= maxY; y++)
            for (let z = minZ; z <= maxZ; z++)
                for (let x = minX; x <= maxX; x++)
                    this.setBlock(x, y, z, blockName);
    }

    /** Print palette and dimensions. */
    describe() {
        console.log(`\nSchematic: ${this.width}×${this.height}×${this.length}`);
        console.log(`Origin: world (${this.origin.x}, ${this.origin.y}, ${this.origin.z})`);
        for (const [name, idx] of [...this.palette.entries()].sort((a, b) => a[1] - b[1])) {
            console.log(`  [${idx}] ${name}`);
        }
    }

    /** Encode block data using Minecraft varint delta compression. */
    _encodeBlocks() {
        const result = [];
        let last = 0;
        for (let i = 0; i < this.blocks.length; i++) {
            const v = this.blocks[i];
            const delta = v - last;
            last = v;
            // Zigzag encoding
            result.push(...zigzag(delta));
        }
        return result;
    }

    /** Serialize to Sponge Schematic v3 binary format. */
    _serialize() {
        const buf = [];

        // Root compound: TAG_COMPOUND with name "Schematic"
        buf.push(Buffer.from([TAG.COMPOUND]));
        writeString(buf, 'Schematic');

        // Width, Height, Length (TAG_Short)
        writeTagHeader(buf, TAG.SHORT, 'Width');
        writeShort(buf, this.width);
        writeTagHeader(buf, TAG.SHORT, 'Height');
        writeShort(buf, this.height);
        writeTagHeader(buf, TAG.SHORT, 'Length');
        writeShort(buf, this.length);

        // DataVersion (TAG_Int, Minecraft 1.20.4 = 2730)
        writeTagHeader(buf, TAG.INT, 'DataVersion');
        writeInt(buf, 2730);

        // Metadata compound
        writeTagHeader(buf, TAG.COMPOUND, 'Metadata');

        // Palette — written directly without relying on string-keyed compound
        writeTagHeader(buf, TAG.COMPOUND, 'Palette');
        for (const [name, idx] of [...this.palette.entries()].sort((a, b) => a[1] - b[1])) {
            writeTagHeader(buf, TAG.INT, name);
            writeInt(buf, idx);
        }
        buf.push(Buffer.from([TAG.END])); // close Palette compound

        // PaletteMax
        writeTagHeader(buf, TAG.INT, 'PaletteMax');
        writeInt(buf, this.paletteIndex);

        // Blocks (delta-encoded varint array, stored as TAG_BYTE_ARRAY)
        const blockBytes = this._encodeBlocks();
        writeTagHeader(buf, TAG.BYTE_ARRAY, 'Blocks');
        writeByteArray(buf, blockBytes);

        // Biomes (all zero, TAG_INT_ARRAY)
        writeTagHeader(buf, TAG.INT_ARRAY, 'Biomes');
        writeIntArray(buf, new Array(this.width * this.length).fill(0));

        buf.push(Buffer.from([TAG.END])); // close Metadata compound
        buf.push(Buffer.from([TAG.END])); // close root Schematic compound

        return Buffer.concat(buf);
    }

    /**
     * Save to a .schematic file.
     * @param {string} filepath
     */
    save(filepath) {
        const data = this._serialize();
        writeFileSync(filepath, data);
        console.log(`\n✅  Saved ${filepath}`);
        console.log(`    Dimensions: ${this.width} × ${this.height} × ${this.length}`);
        console.log(`    Block types: ${this.paletteIndex}`);
        console.log(`    File size:   ${Math.round(data.length / 1024)} KB`);
    }
}

module.exports = { SchematicGenerator };
