import fs from 'node:fs';
import type { FileHandle } from 'node:fs/promises';

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let value = i;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[i] = value >>> 0;
}

function updateCrc(crc: number, chunk: Buffer): number {
  for (const byte of chunk) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return crc >>> 0;
}

type Entry = { name: Buffer; crc: number; size: number; offset: number };

/** Small streaming ZIP writer for exports below the classic ZIP 4 GB limit. */
export class ZipWriter {
  private handle: FileHandle | null = null;
  private position = 0;
  private entries: Entry[] = [];

  constructor(private readonly outputPath: string) {}

  private async open() {
    if (!this.handle) this.handle = await fs.promises.open(this.outputPath, 'w');
  }

  private async write(buffer: Buffer) {
    await this.open();
    let written = 0;
    while (written < buffer.length) {
      const result = await this.handle!.write(buffer, written, buffer.length - written, this.position);
      if (result.bytesWritten === 0) throw new Error('تعذر كتابة ملف الأرشيف');
      written += result.bytesWritten;
      this.position += result.bytesWritten;
    }
  }

  private beginEntry(name: string, size: number, crc: number): Buffer {
    if (!name || name.startsWith('/') || name.includes('..') || name.includes('\\')) throw new Error('اسم ملف غير صالح داخل الأرشيف');
    if (size > 0xffffffff || this.position > 0xffffffff) throw new Error('ملف الأرشيف أكبر من الحد المدعوم');
    const nameBytes = Buffer.from(name, 'utf8');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); // UTF-8 filenames
    header.writeUInt16LE(0, 8); // Store, images are already compressed
    header.writeUInt32LE(crc >>> 0, 14);
    header.writeUInt32LE(size, 18);
    header.writeUInt32LE(size, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    this.entries.push({ name: nameBytes, crc, size, offset: this.position });
    return Buffer.concat([header, nameBytes]);
  }

  async addBuffer(name: string, data: Buffer | string) {
    const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    const crc = (updateCrc(0xffffffff, buffer) ^ 0xffffffff) >>> 0;
    await this.write(this.beginEntry(name, buffer.length, crc));
    await this.write(buffer);
  }

  async addFile(name: string, sourcePath: string) {
    let crc = 0xffffffff;
    let size = 0;
    for await (const chunk of fs.createReadStream(sourcePath)) {
      const bytes = chunk as Buffer;
      crc = updateCrc(crc, bytes);
      size += bytes.length;
    }
    await this.write(this.beginEntry(name, size, (crc ^ 0xffffffff) >>> 0));
    for await (const chunk of fs.createReadStream(sourcePath)) await this.write(chunk as Buffer);
  }

  async close() {
    await this.open();
    const directoryOffset = this.position;
    for (const entry of this.entries) {
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(20, 6);
      header.writeUInt16LE(0x0800, 8);
      header.writeUInt32LE(entry.crc, 16);
      header.writeUInt32LE(entry.size, 20);
      header.writeUInt32LE(entry.size, 24);
      header.writeUInt16LE(entry.name.length, 28);
      header.writeUInt32LE(entry.offset, 42);
      await this.write(Buffer.concat([header, entry.name]));
    }
    const directorySize = this.position - directoryOffset;
    if (this.entries.length > 0xffff || this.position > 0xffffffff) throw new Error('الأرشيف أكبر من الحد المدعوم');
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(directorySize, 12);
    end.writeUInt32LE(directoryOffset, 16);
    await this.write(end);
    await this.handle!.sync();
    await this.handle!.close();
    this.handle = null;
  }

  async abort() {
    await this.handle?.close();
    this.handle = null;
    await fs.promises.rm(this.outputPath, { force: true });
  }
}
